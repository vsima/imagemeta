import {
  type ImageMetadata,
  type ImageFormat,
  UnsupportedFormatError,
} from "./types.ts";
import {
  isWebp,
  readWebpMetadata,
  writeWebpMetadata,
  removeWebpMetadata,
} from "./formats/webp.ts";
import {
  readAvifMetadata,
  writeAvifMetadata,
  removeAvifMetadata,
} from "./formats/avif.ts";
import { serializeXmp } from "./xmp/serialize.ts";
import { parseXmp } from "./xmp/parse.ts";

export type { ImageMetadata, ImageFormat };
export { UnsupportedFormatError };
export { serializeXmp, parseXmp };

/** Detect the container format from magic bytes. */
export function detectFormat(buf: Uint8Array): ImageFormat {
  if (isWebp(buf)) return "webp";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "png";
  // ISOBMFF: bytes 4-7 are "ftyp"; brand at 8 distinguishes avif/heic.
  if (
    buf.length >= 12 &&
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    const brand = new TextDecoder("latin1").decode(buf.subarray(8, 12));
    if (/avif|avis|heic|heix|mif1|msf1/.test(brand)) return "avif";
  }
  return "unknown";
}

/**
 * Read semantic metadata from an image buffer.
 * v1 reads WebP XMP; other formats throw a clear UnsupportedFormatError.
 */
export function readMetadata(buf: Uint8Array): ImageMetadata {
  const format = detectFormat(buf);
  switch (format) {
    case "webp":
      return readWebpMetadata(buf);
    case "avif":
      return readAvifMetadata(buf);
    default:
      throw new UnsupportedFormatError(format, "readMetadata");
  }
}

/**
 * Write semantic metadata into an image buffer, preserving pixels byte-for-byte.
 * Returns a new buffer; the input is never mutated.
 * v1 writes WebP XMP; other formats throw a clear UnsupportedFormatError.
 */
export function writeMetadata(
  buf: Uint8Array,
  meta: ImageMetadata,
): Uint8Array {
  const format = detectFormat(buf);
  switch (format) {
    case "webp":
      return writeWebpMetadata(buf, meta);
    case "avif":
      return writeAvifMetadata(buf, meta);
    default:
      throw new UnsupportedFormatError(format, "writeMetadata");
  }
}

/**
 * Remove XMP/EXIF metadata from an image, preserving pixels and ICC profile.
 * Returns a new buffer; the input is never mutated.
 * v1 supports WebP; other formats throw a clear UnsupportedFormatError.
 */
export function removeMetadata(buf: Uint8Array): Uint8Array {
  const format = detectFormat(buf);
  switch (format) {
    case "webp":
      return removeWebpMetadata(buf);
    case "avif":
      return removeAvifMetadata(buf);
    default:
      throw new UnsupportedFormatError(format, "removeMetadata");
  }
}
