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
import {
  readJpegMetadata,
  writeJpegMetadata,
  removeJpegMetadata,
} from "./formats/jpeg.ts";
import {
  readPngMetadata,
  writePngMetadata,
  removePngMetadata,
} from "./formats/png.ts";
import { serializeXmp } from "./xmp/serialize.ts";
import { parseXmp } from "./xmp/parse.ts";

export type { ImageMetadata, ImageFormat };
export { UnsupportedFormatError };
export { serializeXmp, parseXmp };

function dataU32(buf: Uint8Array, o: number): number {
  return (
    ((buf[o]! << 24) | (buf[o + 1]! << 16) | (buf[o + 2]! << 8) | buf[o + 3]!) >>>
    0
  );
}

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
  // ISOBMFF: bytes 4-7 are "ftyp". The major + compatible brands distinguish
  // AVIF (AV1) from HEIC/HEIF (HEVC). Both share the same container, so they
  // route to the same reader/writer — the label is informational.
  if (
    buf.length >= 12 &&
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    const dec = new TextDecoder("latin1");
    const view = dataU32(buf, 0);
    const ftypEnd = view > 8 && view <= buf.length ? view : buf.length;
    const brands: string[] = [];
    for (let o = 8; o + 4 <= ftypEnd; o += o === 8 ? 8 : 4) {
      brands.push(dec.decode(buf.subarray(o, o + 4))); // major brand, then compatible brands (skipping minor version)
    }
    if (brands.some((b) => b === "avif" || b === "avis")) return "avif";
    if (
      brands.some((b) =>
        /^(heic|heix|heim|heis|hevc|hevx|heif|mif1|mif2|msf1|miaf)$/.test(b),
      )
    )
      return "heic";
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
    case "heic":
      return readAvifMetadata(buf);
    case "jpeg":
      return readJpegMetadata(buf);
    case "png":
      return readPngMetadata(buf);
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
    case "heic":
      return writeAvifMetadata(buf, meta);
    case "jpeg":
      return writeJpegMetadata(buf, meta);
    case "png":
      return writePngMetadata(buf, meta);
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
    case "heic":
      return removeAvifMetadata(buf);
    case "jpeg":
      return removeJpegMetadata(buf);
    case "png":
      return removePngMetadata(buf);
    default:
      throw new UnsupportedFormatError(format, "removeMetadata");
  }
}
