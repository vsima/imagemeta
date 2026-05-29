# Roadmap

v1 ships **WebP, AVIF, JPEG, and PNG** read/write/remove (plus HEIC read) — all
four major web image formats. AVIF was built first because it's the hardest and
the project's differentiator. EXIF descriptive-tag write remains.

## Order & rationale

### ✅ WebP — done
Flat RIFF chunks, no offset math. Proves the splice engine and the
simple→extended upgrade pattern.

### ✅ AVIF — done (read + write + remove)
ISOBMFF box tree; XMP is a `mime` item located via `iloc`. Writing rebuilds
`meta` (`iinf`/`iloc`/`iref`) and `mdat` from scratch, recomputing every offset,
so the compressed image relocates byte-for-byte. **HEIC read comes free** (same
container). See [`avif-format.md`](avif-format.md).

### ✅ HEIC — read (free with AVIF)
Identical container; the AVIF reader handles it. Write not yet exposed.

### ✅ JPEG — done (read + write + remove)
XMP in an `APP1` marker segment (`http://ns.adobe.com/xap/1.0/\0`). Header
segments are parsed up to `SOS`; the entropy-coded scan and everything after is
copied verbatim. EXIF `APP1` segments are left untouched.
- **Known limit:** packets > ~64 KB need ExtendedXMP (multi-segment) — throws
  clearly for now; our descriptive packets are ~1–2 KB.

### ✅ PNG — done (read + write + remove)
XMP in a standard `iTXt` chunk (`XML:com.adobe.xmp`), with a from-scratch
zero-dependency CRC-32. Compressed `iTXt` (flag=1) is not read (would need an
inflate dependency); remove also strips ImageMagick's non-standard
`zTXt "Raw profile type xmp"`.

### 🔜 EXIF descriptive-tag write *(secondary)*
`ImageDescription`, `Artist`, `Copyright`, `Orientation`. This re-introduces
TIFF/IFD offset recalculation and the MakerNote-preservation problem, so it's
intentionally **not** the headline. When implemented, MakerNotes will be
preserved byte-for-byte at their original position or left untouched — never
relocated.

## Explicitly out of scope (for now)
- MakerNote *interpretation* (manufacturer-specific; exiftool's territory).
- Full RDF/XML parsing (would add a dependency).
- Image transformation/resizing (use a codec library for that — this tool is
  metadata-only by design).
- TIFF/DNG, JPEG XL, GIF.

## Design guarantee carried across all formats
Zero runtime dependencies, never re-encode pixels, return a new buffer, fail
loudly on unsupported input. Any contribution must hold these. See
[`../CONTRIBUTING.md`](../CONTRIBUTING.md).
