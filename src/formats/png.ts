import type { ImageMetadata } from "../types.ts";
import { serializeXmp } from "../xmp/serialize.ts";
import { parseXmp } from "../xmp/parse.ts";

/**
 * PNG metadata engine — byte-preserving chunk splice.
 *
 * A PNG is an 8-byte signature followed by chunks:
 *   length(4, big-endian) | type(4) | data(length) | CRC-32(4 over type+data).
 * Standard XMP lives in an `iTXt` chunk with keyword `XML:com.adobe.xmp`,
 * uncompressed, holding the UTF-8 XMP packet. We insert/replace that chunk and
 * copy every other chunk (including IDAT image data) verbatim.
 */

const UTF8 = new TextDecoder("utf-8");
const LATIN1 = new TextDecoder("latin1");
const ENC = new TextEncoder();
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const XMP_KEYWORD = "XML:com.adobe.xmp";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Chunk {
  type: string;
  start: number; // offset of the length field
  dataStart: number;
  length: number;
  end: number; // exclusive, includes CRC
}

export function isPng(b: Uint8Array): boolean {
  if (b.length < 8) return false;
  for (let i = 0; i < 8; i++) if (b[i] !== SIG[i]) return false;
  return true;
}

function parseChunks(b: Uint8Array): Chunk[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const chunks: Chunk[] = [];
  let o = 8;
  while (o + 12 <= b.length) {
    const length = view.getUint32(o);
    const type = LATIN1.decode(b.subarray(o + 4, o + 8));
    const end = o + 12 + length;
    if (end > b.length) break; // truncated
    chunks.push({ type, start: o, dataStart: o + 8, length, end });
    o = end;
    if (type === "IEND") break;
  }
  return chunks;
}

function isXmpITxt(b: Uint8Array, chunk: Chunk): boolean {
  if (chunk.type !== "iTXt") return false;
  for (let i = 0; i < XMP_KEYWORD.length; i++)
    if (b[chunk.dataStart + i] !== XMP_KEYWORD.charCodeAt(i)) return false;
  return b[chunk.dataStart + XMP_KEYWORD.length] === 0;
}

function buildITxt(packet: Uint8Array): Uint8Array {
  // keyword\0 + compFlag(0) + compMethod(0) + lang\0 + translatedKeyword\0 + text
  const data = new Uint8Array(
    XMP_KEYWORD.length + 5 + packet.length,
  );
  data.set(ENC.encode(XMP_KEYWORD), 0);
  // five zero bytes already present: NUL, compFlag, compMethod, lang NUL, transKw NUL
  data.set(packet, XMP_KEYWORD.length + 5);

  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(ENC.encode("iTXt"), 4);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length); // type + data
  view.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function readPngMetadata(b: Uint8Array): ImageMetadata {
  if (!isPng(b)) return {};
  for (const c of parseChunks(b)) {
    if (!isXmpITxt(b, c)) continue;
    // Skip keyword NUL + compFlag + compMethod, then lang NUL + transKw NUL.
    let o = c.dataStart + XMP_KEYWORD.length + 1;
    const compFlag = b[o]!;
    o += 2; // compression flag + method
    if (compFlag !== 0) return {}; // compressed iTXt not supported (no zlib dep)
    while (b[o] !== 0 && o < c.end) o++; // language tag
    o++;
    while (b[o] !== 0 && o < c.end) o++; // translated keyword
    o++;
    return parseXmp(UTF8.decode(b.subarray(o, c.end - 4)));
  }
  return {};
}

export function writePngMetadata(
  b: Uint8Array,
  meta: ImageMetadata,
): Uint8Array {
  const chunks = parseChunks(b);
  const itxt = buildITxt(ENC.encode(serializeXmp(meta)));

  const out: Uint8Array[] = [b.slice(0, 8)]; // signature
  let inserted = false;
  for (const c of chunks) {
    if (isXmpITxt(b, c)) continue; // drop existing XMP
    out.push(b.slice(c.start, c.end));
    if (!inserted && c.type === "IHDR") {
      out.push(itxt); // XMP right after IHDR
      inserted = true;
    }
  }
  return concat(out);
}

export function removePngMetadata(b: Uint8Array): Uint8Array {
  const chunks = parseChunks(b);
  const out: Uint8Array[] = [b.slice(0, 8)];
  for (const c of chunks) {
    if (isXmpITxt(b, c)) continue;
    // Also drop ImageMagick's non-standard compressed XMP ("Raw profile type xmp").
    if (c.type === "zTXt" || c.type === "iTXt" || c.type === "tEXt") {
      const kw = LATIN1.decode(
        b.subarray(c.dataStart, Math.min(c.dataStart + 24, c.end)),
      );
      if (kw.startsWith("Raw profile type xmp")) continue;
    }
    out.push(b.slice(c.start, c.end));
  }
  return concat(out);
}
