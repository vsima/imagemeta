# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
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
- AVIF read, then AVIF write (ISOBMFF `iloc` offset recalculation).
- EXIF descriptive-tag write.
