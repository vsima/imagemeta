# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **JPEG read + write + remove** — XMP via `APP1` marker segment; entropy-coded
  image data preserved byte-for-byte. EXIF `APP1` segments left untouched.
- **PNG read + write + remove** — XMP via standard `iTXt` (`XML:com.adobe.xmp`)
  with correct CRC-32; zero-dependency CRC implementation. Remove also strips
  ImageMagick's non-standard `zTXt "Raw profile type xmp"`.
- **AVIF + HEIC read + write + remove** (same ISOBMFF container, different
  codec). Full box-tree parsing; writes via a from-scratch rebuild that
  regenerates `iinf`/`iloc`/`iref` and recomputes all `iloc` offsets, so the
  compressed image is relocated byte-for-byte (verified: decoded pixels
  identical). HEIC write validated against the Nokia HEIF conformance suite
  (63 files: grids, overlays, thumbnails, `idat`, multi-item). `"heic"` is a
  first-class `detectFormat` result; image *sequences* (`msf1`/`heis` with no
  `meta` box) are cleanly refused rather than corrupted.
- Shared ISOBMFF reader (`src/formats/isobmff.ts`).
- WebP read/write/remove for XMP descriptive metadata (`readMetadata`,
  `writeMetadata`, `removeMetadata`).
- Automatic simple→extended (`VP8X`) upgrade when tagging plain WebP files,
  with canvas dimensions read directly from the `VP8 `/`VP8L`/`VP8X` bitstream.
- Semantic, AEO-oriented `ImageMetadata` shape mapped onto `dc:`, `photoshop:`,
  `Iptc4xmpCore:`, and `xmpRights:` XMP namespaces.
- Standalone XMP packet helpers: `serializeXmp`, `parseXmp`.
- `detectFormat` magic-byte detection for WebP / JPEG / PNG / AVIF.
- Typed `UnsupportedFormatError` for not-yet-implemented formats.
- Test suite (19 tests) over real WebP fixtures, including byte-level pixel
  preservation and RIFF-framing validation.

### Roadmap
- EXIF descriptive-tag write (`ImageDescription`/`Artist`/`Copyright`).
- ExtendedXMP for JPEG packets > 64 KB.
- ISOBMFF image *sequence* (`msf1`/`heis`) metadata.
