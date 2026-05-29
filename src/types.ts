/**
 * Semantic, AEO-oriented metadata shape.
 *
 * This is deliberately NOT a raw EXIF/XMP tag map. It models the fields that
 * answer engines and search crawlers actually read about an image, and the
 * library maps them onto the correct XMP namespaces (dc:, photoshop:,
 * Iptc4xmpCore:, xmpRights:) under the hood.
 */
export interface ImageMetadata {
  /** Human/AI-readable caption: "what is this image". Maps to dc:description (x-default). */
  description?: string;
  /** Short title. Maps to dc:title (x-default). */
  title?: string;
  /** Keyword/tag list. Maps to dc:subject (rdf:Bag). */
  keywords?: string[];
  /** Author/creator. Maps to dc:creator (rdf:Seq). */
  creator?: string;
  /** Copyright / rights statement. Maps to dc:rights (x-default). */
  rights?: string;
  /** Accessibility alt text — the field Google reads. Maps to Iptc4xmpCore:AltTextAccessibility. */
  altText?: string;
  /** Credit line. Maps to photoshop:Credit. */
  credit?: string;
}

export type ImageFormat = "webp" | "jpeg" | "png" | "avif" | "unknown";

export class UnsupportedFormatError extends Error {
  readonly format: ImageFormat;
  constructor(format: ImageFormat, operation: string) {
    super(
      `${operation} does not support format "${format}". ` +
        `Supported: WebP, AVIF, JPEG, PNG (and HEIC read).`,
    );
    this.name = "UnsupportedFormatError";
    this.format = format;
  }
}
