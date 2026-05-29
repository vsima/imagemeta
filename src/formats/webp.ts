import type { ImageMetadata } from "../types.ts";
import { serializeXmp } from "../xmp/serialize.ts";
import { parseXmp } from "../xmp/parse.ts";

/**
 * WebP container engine — byte-preserving metadata splice.
 *
 * WebP is a RIFF file: a 12-byte header then a flat list of chunks
 *   [FourCC(4) | size(4, LE) | payload(size) | pad(1 if size is odd)].
 * Metadata lives in its own `XMP ` / `EXIF` chunk. To carry metadata a file
 * must be "extended" (have a `VP8X` chunk whose flag bits advertise what's
 * present). A plain `VP8 `/`VP8L` file has no such header, so we synthesize one.
 *
 * We never touch the compressed image chunk — pixels are copied verbatim.
 */

const TEXT = new TextDecoder("latin1"); // ASCII FourCCs / structural bytes
const UTF8 = new TextDecoder("utf-8"); // XMP packet payloads are UTF-8
const ENC = new TextEncoder(); // TextEncoder always emits UTF-8

// VP8X flag bits (byte 0 of the VP8X payload, MSB-first per the WebP spec):
//   Rsv Rsv ICC Alpha EXIF XMP Anim Rsv
const FLAG_EXIF = 0x08;
const FLAG_XMP = 0x04;

interface Chunk {
  fourcc: string;
  /** Payload only (excludes the 8-byte header and any pad byte). */
  data: Uint8Array;
}

function fourccAt(buf: Uint8Array, off: number): string {
  return TEXT.decode(buf.subarray(off, off + 4));
}

function readU32LE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off]! | (buf[off + 1]! << 8) | (buf[off + 2]! << 16)) >>> 0) +
    buf[off + 3]! * 0x1000000
  );
}

export function isWebp(buf: Uint8Array): boolean {
  return (
    buf.length >= 12 &&
    fourccAt(buf, 0) === "RIFF" &&
    fourccAt(buf, 8) === "WEBP"
  );
}

function parseChunks(buf: Uint8Array): Chunk[] {
  if (!isWebp(buf)) throw new Error("Not a WebP file (missing RIFF/WEBP).");
  const declared = readU32LE(buf, 4); // bytes after this field
  const end = Math.min(buf.length, 8 + declared);
  const chunks: Chunk[] = [];
  let off = 12;
  while (off + 8 <= end) {
    const fourcc = fourccAt(buf, off);
    const size = readU32LE(buf, off + 8 - 4);
    const dataStart = off + 8;
    if (dataStart + size > buf.length) break; // truncated; stop gracefully
    chunks.push({ fourcc, data: buf.subarray(dataStart, dataStart + size) });
    off = dataStart + size + (size & 1); // skip pad byte on odd sizes
  }
  return chunks;
}

/** Extract canvas dimensions from the image chunk to build a VP8X header. */
function readDimensions(chunks: Chunk[]): { width: number; height: number } {
  const vp8x = chunks.find((c) => c.fourcc === "VP8X");
  if (vp8x && vp8x.data.length >= 10) {
    const d = vp8x.data;
    const width = ((d[4]! | (d[5]! << 8) | (d[6]! << 16)) >>> 0) + 1;
    const height = ((d[7]! | (d[8]! << 8) | (d[9]! << 16)) >>> 0) + 1;
    return { width, height };
  }
  const lossy = chunks.find((c) => c.fourcc === "VP8 ");
  if (lossy && lossy.data.length >= 10) {
    const d = lossy.data;
    // frame tag (3) + start code 0x9d 0x01 0x2a (3) + width(2) + height(2)
    const width = (d[6]! | (d[7]! << 8)) & 0x3fff;
    const height = (d[8]! | (d[9]! << 8)) & 0x3fff;
    return { width, height };
  }
  const lossless = chunks.find((c) => c.fourcc === "VP8L");
  if (lossless && lossless.data.length >= 5) {
    const d = lossless.data; // d[0] === 0x2f signature
    const bits =
      (d[1]! | (d[2]! << 8) | (d[3]! << 16) | (d[4]! << 24)) >>> 0;
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return { width, height };
  }
  throw new Error("Could not determine WebP canvas dimensions.");
}

function makeVp8x(
  width: number,
  height: number,
  flags: number,
): Chunk {
  const data = new Uint8Array(10);
  data[0] = flags;
  const w = width - 1;
  const h = height - 1;
  data[4] = w & 0xff;
  data[5] = (w >> 8) & 0xff;
  data[6] = (w >> 16) & 0xff;
  data[7] = h & 0xff;
  data[8] = (h >> 8) & 0xff;
  data[9] = (h >> 16) & 0xff;
  return { fourcc: "VP8X", data };
}

function serialize(chunks: Chunk[]): Uint8Array {
  let body = 4; // "WEBP"
  for (const c of chunks) body += 8 + c.data.length + (c.data.length & 1);

  const out = new Uint8Array(8 + body);
  out.set(ENC.encode("RIFF"), 0);
  const riffSize = body; // everything after the 8-byte RIFF+size header
  out[4] = riffSize & 0xff;
  out[5] = (riffSize >> 8) & 0xff;
  out[6] = (riffSize >> 16) & 0xff;
  out[7] = (riffSize >>> 24) & 0xff;
  out.set(ENC.encode("WEBP"), 8);

  let off = 12;
  for (const c of chunks) {
    out.set(ENC.encode(c.fourcc.padEnd(4)), off);
    const size = c.data.length;
    out[off + 4] = size & 0xff;
    out[off + 5] = (size >> 8) & 0xff;
    out[off + 6] = (size >> 16) & 0xff;
    out[off + 7] = (size >>> 24) & 0xff;
    out.set(c.data, off + 8);
    off += 8 + size + (size & 1); // pad byte stays 0
  }
  return out;
}

export function readWebpMetadata(buf: Uint8Array): ImageMetadata {
  const chunks = parseChunks(buf);
  const xmpChunk = chunks.find((c) => c.fourcc === "XMP ");
  if (!xmpChunk) return {};
  return parseXmp(UTF8.decode(xmpChunk.data));
}

export function writeWebpMetadata(
  buf: Uint8Array,
  meta: ImageMetadata,
): Uint8Array {
  let chunks = parseChunks(buf);
  const { width, height } = readDimensions(chunks);

  // Drop any existing metadata chunk we are about to rewrite.
  chunks = chunks.filter((c) => c.fourcc !== "XMP ");

  // Ensure an extended header exists, and set the XMP presence flag.
  let vp8x = chunks.find((c) => c.fourcc === "VP8X");
  if (!vp8x) {
    vp8x = makeVp8x(width, height, FLAG_XMP);
    chunks.unshift(vp8x); // VP8X must be the first chunk
  } else {
    vp8x.data = vp8x.data.slice(); // detach from source buffer before mutating
    vp8x.data[0] = vp8x.data[0]! | FLAG_XMP; // set XMP; leave EXIF/ICC/Alpha as-is
  }

  // Metadata chunks belong at the end of the file, after the image data.
  const xmpPacket = ENC.encode(serializeXmp(meta));
  chunks.push({ fourcc: "XMP ", data: xmpPacket });

  return serialize(chunks);
}

/**
 * Strip XMP and EXIF metadata (privacy / size). The ICC colour profile and all
 * image data are preserved; pixels are never re-encoded.
 */
export function removeWebpMetadata(buf: Uint8Array): Uint8Array {
  let chunks = parseChunks(buf);
  chunks = chunks.filter((c) => c.fourcc !== "XMP " && c.fourcc !== "EXIF");
  const vp8x = chunks.find((c) => c.fourcc === "VP8X");
  if (vp8x) {
    vp8x.data = vp8x.data.slice();
    vp8x.data[0] = vp8x.data[0]! & ~(FLAG_XMP | FLAG_EXIF); // clear metadata flags
  }
  return serialize(chunks);
}
