/**
 * Minimal ISOBMFF (ISO Base Media File Format) reader for the boxes AVIF/HEIC
 * use to store metadata. This is shared parsing machinery; the AVIF-specific
 * XMP logic lives in `avif.ts`.
 *
 * A box is: size(4, big-endian) + type(4 ASCII) + payload. size===1 means a
 * 64-bit largesize follows the type; size===0 means "to end of file". A FullBox
 * additionally begins its payload with version(1) + flags(3).
 */

const LATIN1 = new TextDecoder("latin1");

export interface Box {
  type: string;
  /** Offset of the box's size field. */
  start: number;
  /** 8, or 16 when a 64-bit largesize is used. */
  headerSize: number;
  /** Total box length including header. */
  size: number;
}

export function fourccAt(b: Uint8Array, o: number): string {
  return LATIN1.decode(b.subarray(o, o + 4));
}

export function dv(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

/** Read a big-endian unsigned integer of `n` bytes (n ≤ 8, value < 2^53). */
export function readUintBE(b: Uint8Array, o: number, n: number): number {
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + b[o + i]!;
  return v;
}

/** Parse the sequence of boxes in [start, end). */
export function parseBoxes(b: Uint8Array, start: number, end: number): Box[] {
  const view = dv(b);
  const boxes: Box[] = [];
  let o = start;
  while (o + 8 <= end) {
    let size = view.getUint32(o);
    const type = fourccAt(b, o + 4);
    let headerSize = 8;
    if (size === 1) {
      const hi = view.getUint32(o + 8);
      const lo = view.getUint32(o + 12);
      size = hi * 0x100000000 + lo;
      headerSize = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < headerSize || o + size > end) break; // malformed; stop gracefully
    boxes.push({ type, start: o, headerSize, size });
    o += size;
  }
  return boxes;
}

/** First child box of a container box (skips the FullBox version+flags if told to). */
export function childBoxes(
  b: Uint8Array,
  box: Box,
  fullBox = false,
): Box[] {
  const start = box.start + box.headerSize + (fullBox ? 4 : 0);
  return parseBoxes(b, start, box.start + box.size);
}

export function find(boxes: Box[], type: string): Box | undefined {
  return boxes.find((x) => x.type === type);
}

/** Read a NUL-terminated string starting at `o`; returns text and the index after the NUL. */
export function readCString(
  b: Uint8Array,
  o: number,
  end: number,
): { str: string; next: number } {
  let i = o;
  while (i < end && b[i] !== 0) i++;
  return { str: LATIN1.decode(b.subarray(o, i)), next: i + 1 };
}
