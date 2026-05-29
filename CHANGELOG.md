# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **AVIF read + write + remove** (and **HEIC read**, same container). Full
  ISOBMFF box-tree parsing; writes via a from-scratch rebuild that regenerates
  `iinf`/`iloc`/`iref` and recomputes all `iloc` offsets, so the compressed
  image is relocated byte-for-byte (verified: decoded pixels identical).
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
- JPEG (APP1 segment splice).
- PNG (`iTXt` chunk splice).
- EXIF descriptive-tag write.
