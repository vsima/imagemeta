# Roadmap

v1 ships **WebP and AVIF** read/write/remove — the two modern web formats, and
the hardest piece (AVIF) up front because it's the project's differentiator.
JPEG and PNG remain.

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

### 🔜 JPEG — read + write
- **Slot:** XMP lives in an `APP1` marker segment whose payload begins with the
  namespace signature `http://ns.adobe.com/xap/1.0/\0`.
- **Work:** walk the `0xFF`-prefixed marker segments, replace/insert the XMP
  `APP1`, copy all other segments (including the image scan) verbatim.
- **Risk:** low. No offset pointers in the XMP path. (EXIF in `APP1`/TIFF is the
  fragile part — deliberately deferred; see below.)
- **Watch:** the 64 KB per-segment limit → ExtendedXMP across multiple segments
  for large packets.

### 🔜 PNG — read + write
- **Slot:** XMP goes in an `iTXt` chunk with keyword `XML:com.adobe.xmp`.
- **Work:** chunk-based like WebP, plus a **CRC-32** per chunk.
- **Risk:** low. Clean chunked format.

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
