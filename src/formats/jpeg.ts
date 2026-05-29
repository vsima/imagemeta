import type { ImageMetadata } from "../types.ts";
import { serializeXmp } from "../xmp/serialize.ts";
import { parseXmp } from "../xmp/parse.ts";

/**
 * JPEG metadata engine — byte-preserving APP1 splice.
 *
 * A JPEG is SOI (`FF D8`) followed by marker segments. XMP lives in an `APP1`
 * (`FF E1`) segment whose payload begins with the signature
 * `http://ns.adobe.com/xap/1.0/\0`, then the XMP packet. (EXIF also uses APP1,
 * but with an `Exif\0\0` signature — we leave those untouched.)
 *
 * We parse only the header segments up to the start-of-scan (`SOS`, `FF DA`);
 * the entropy-coded image data and everything after is copied verbatim.
 */

const UTF8 = new TextDecoder("utf-8");
const ENC = new TextEncoder();
const XMP_SIG = "http://ns.adobe.com/xap/1.0/"; // followed by a NUL byte

interface Segment {
  marker: number;
  start: number; // offset of the 0xFF
  end: number; // exclusive
  payloadStart: number;
  isXmp: boolean;
}

export function isJpeg(b: Uint8Array): boolean {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function matchesSig(b: Uint8Array, off: number): boolean {
  for (let i = 0; i < XMP_SIG.length; i++)
    if (b[off + i] !== XMP_SIG.charCodeAt(i)) return false;
  return b[off + XMP_SIG.length] === 0; // trailing NUL
}

/** Parse header segments up to SOS/EOI. Returns the segments and the tail offset. */
function parseSegments(b: Uint8Array): { segments: Segment[]; tailStart: number } {
  const segments: Segment[] = [];
  let o = 2; // after SOI
  let tailStart = b.length;
  while (o + 1 < b.length) {
    if (b[o] !== 0xff) break; // malformed; bail to tail
    let marker = b[o + 1]!;
    while (marker === 0xff && o + 2 < b.length) {
      o++; // skip fill bytes
      marker = b[o + 1]!;
    }
    if (marker === 0xd9 || marker === 0xda) {
      tailStart = o; // EOI or SOS — rest is opaque
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2; // standalone marker, no length
      continue;
    }
    const len = (b[o + 2]! << 8) | b[o + 3]!;
    if (len < 2 || o + 2 + len > b.length) {
      tailStart = o;
      break; // malformed length; treat the rest as opaque
    }
    const payloadStart = o + 4;
    segments.push({
      marker,
      start: o,
      end: o + 2 + len,
      payloadStart,
      isXmp: marker === 0xe1 && matchesSig(b, payloadStart),
    });
    o = o + 2 + len;
  }
  return { segments, tailStart };
}

function buildXmpSegment(packet: Uint8Array): Uint8Array {
  const sig = ENC.encode(XMP_SIG);
  const len = 2 + sig.length + 1 + packet.length; // length field includes itself
  if (len > 0xffff)
    throw new Error(
      "JPEG: XMP packet exceeds a single APP1 segment (65533 bytes); " +
        "ExtendedXMP is not yet supported.",
    );
  const out = new Uint8Array(2 + len);
  out[0] = 0xff;
  out[1] = 0xe1;
  out[2] = (len >> 8) & 0xff;
  out[3] = len & 0xff;
  out.set(sig, 4);
  out[4 + sig.length] = 0; // NUL after signature
  out.set(packet, 4 + sig.length + 1);
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

export function readJpegMetadata(b: Uint8Array): ImageMetadata {
  if (!isJpeg(b)) return {};
  const { segments } = parseSegments(b);
  const xmp = segments.find((s) => s.isXmp);
  if (!xmp) return {};
  const start = xmp.payloadStart + XMP_SIG.length + 1;
  return parseXmp(UTF8.decode(b.subarray(start, xmp.end)));
}

export function writeJpegMetadata(
  b: Uint8Array,
  meta: ImageMetadata,
): Uint8Array {
  const { segments, tailStart } = parseSegments(b);
  const newXmp = buildXmpSegment(ENC.encode(serializeXmp(meta)));

  const out: Uint8Array[] = [b.slice(0, 2)]; // SOI
  let inserted = false;
  for (const s of segments) {
    if (s.isXmp) continue; // drop the old XMP segment
    out.push(b.slice(s.start, s.end));
    if (!inserted && s.marker === 0xe0) {
      out.push(newXmp); // place XMP right after APP0 (JFIF)
      inserted = true;
    }
  }
  if (!inserted) out.splice(1, 0, newXmp); // no APP0 → right after SOI
  out.push(b.slice(tailStart));
  return concat(out);
}

export function removeJpegMetadata(b: Uint8Array): Uint8Array {
  const { segments, tailStart } = parseSegments(b);
  const out: Uint8Array[] = [b.slice(0, 2)];
  for (const s of segments) {
    if (s.isXmp) continue;
    out.push(b.slice(s.start, s.end));
  }
  out.push(b.slice(tailStart));
  return concat(out);
}
