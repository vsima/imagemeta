# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-06-01

### Added
- **IPTC/XMP licensing & rights fields** implementing Google's documented
  *Licensable* image feature: `licenseUrl` (`xmpRights:WebStatement`), `licensor`
  (IPTC PLUS `plus:Licensor` → `plus:LicensorURL`/`plus:LicensorName`), and
  `copyrightNotice` (`photoshop:Copyright`). Round-trip across all 5 formats;
  verified in ImageMagick. Closes #1.

## [1.0.2] - 2026-06-01

### Changed
- Docs accuracy: reframed claims around what's spec-backed. Added a "What Google
  actually documents" section citing Google's image-metadata/licensing docs and
  IPTC's guide. Clarified that Google Images reads & recommends embedding IPTC
  creator/credit/license metadata, that HTML `alt` (not embedded metadata) drives
  image ranking, and that AI-engine consumption of embedded metadata is
  forward-looking. No code changes.

## [1.0.1] - 2026-05-31

### Changed
- Replaced the `prepare` lifecycle script with `prepublishOnly`. The build now
  runs only at publish time (and explicitly in CI), so the published package has
  **no install scripts at all** — consumers run zero lifecycle code on
  `npm install`. Improves supply-chain posture (clears Socket.dev's install-script
  signal). Note: installing directly from a git URL no longer auto-builds; install
  from npm (`npm install aeo-image`), which ships prebuilt `dist/`.

### Added
- Socket.dev badge in the README.

## [1.0.0] - 2026-05-31

Stable release. The public API (`readMetadata` / `writeMetadata` /
`removeMetadata` / `detectFormat` / `serializeXmp` / `parseXmp` and the
`ImageMetadata` shape) is now covered by semver — no breaking changes without a
major bump. Functionally identical to 0.1.0 plus the trust/packaging hardening
below.

### Added
- **npm provenance** — releases are published from GitHub Actions with OIDC, so
  the npm page shows a verified build-from-source attestation.
- **Zero-dependency CI guard** (`scripts/check-zero-deps.mjs`) — the build fails
  if any runtime dependency is ever introduced, making the "0 deps" claim
  machine-enforced.
- `./package.json` added to the `exports` map for tooling friendliness.
- `repository`, `homepage`, and `bugs` fields (also required for provenance).

## [0.1.0] - 2026-05-31

First public release. Reads, writes, and removes descriptive XMP metadata across
all major web/device image formats — pure TypeScript, zero runtime dependencies,
byte-preserving (never re-encodes pixels).

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
