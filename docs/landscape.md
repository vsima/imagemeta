# Competitive landscape

Why a new library? Because the specific combination this project targets —
**pure JS · zero dependency · XMP-first · byte-preserving · WebP + AVIF** — is
unoccupied, in any language.

## JavaScript ecosystem

| Library | Writes XMP? | Write formats | Zero-dep? | No re-encode? | Notes |
| --- | :---: | --- | :---: | :---: | --- |
| **piexifjs** | ⚠️ | JPEG; WebP (buggy) | ✅ | ✅ | JPEG-first; documented WebP corruption; no AVIF |
| **@mtillmann/jpeg-xmp-writer** | ✅ | JPEG only | ✅ | ✅ | Right philosophy, one format |
| **archilogic/xmp-editor** | ✅ | JPEG only | mostly | unclear | "PNG/GIF later"; no WebP/AVIF |
| **exifr** | ❌ | — (read-only) | ✅ | — | Fast reader, reads WebP/AVIF/XMP |
| **ExifReader** | ❌ | — (read-only) | ✅ | — | Reads everything incl. AVIF |
| **sharp** | ✅ | PNG/JPEG/WebP/TIFF — **not AVIF** | ❌ libvips | ❌ re-encodes | Native dep; re-compresses pixels |
| **webp-converter** | ✅ | WebP only | ❌ wraps `webpmux` | ✅ | Bundled native binary |
| **exiftool (CLI/WASM)** | ✅ | everything | ❌ Perl/WASM | ✅ | The dependency we're eliminating |

**Two facts define the gap:**
1. No pure-JS library writes XMP to WebP without a native binary (the zero-dep
   ones are JPEG-only).
2. **Nothing writes XMP to AVIF in pure JS — not even `sharp`.** Only exiftool
   does it at all.

## Other languages (reference implementations)

| Language | Library | Writes XMP? | Formats | Native dep? | Notes |
| --- | --- | :---: | --- | :---: | --- |
| Perl | exiftool | ✅ | everything | self | The 25-year gold standard (breadth) |
| C++ | Exiv2 | ✅ | JPEG/TIFF/PNG/WebP + AVIF/HEIF (build flag) | compiled | Canonical read/write reference |
| C | libheif | ✅ (HEIF/AVIF) | HEIC/AVIF | compiled | Why AVIF write is non-trivial |
| Rust | **little_exif** | EXIF-first | JPEG/PNG/TIFF/WebP/AVIF/HEIF/JXL | **none** | Closest analog: pure-language, no deps, byte-preserving |
| Rust | img-parts | (splice) | JPEG/PNG/WebP | none | Proves the lossless-splice model |
| Rust | rexiv2 | ✅ | via exiv2 | wraps exiv2 | |
| Python | pyexiv2 / py3exiv2 | ✅ | via exiv2 | wraps exiv2 | |
| Go | dsoprea/* | reads XMP, writes EXIF | JPEG/PNG | none | No WebP/AVIF write |
| Ruby | embed_xmp | ✅ | JPEG/PNG/SVG/WebP | (CLI) | No AVIF |

## Takeaways

- The **algorithms are settled prior art.** Exiv2 (spec-accurate C++) and
  `little_exif` (pure-Rust, no native deps, all our target formats) are the two
  best references to study/port. We are not inventing format handling.
- **No language** has the exact JS + zero-dep + XMP-first + byte-preserving +
  WebP/AVIF combination. `little_exif` is closest but is EXIF-first and in Rust.
- So the contribution is: bring the well-understood, byte-preserving,
  multi-format metadata-splice approach into the JavaScript ecosystem, with an
  XMP-first API aimed at AEO.

**Status:** `imagemeta` now writes XMP to **WebP, AVIF, JPEG, and PNG** in pure
dependency-free JS without re-encoding (plus HEIC read) — filling the
previously-empty cells in the JS table above, including the AVIF row that no
language filled without a native/compiled library.

> Sources for the above (2025–2026 scans) are linked from the project discussion;
> notable references: Exiv2 docs & WebP/BMFF wiki, `little_exif` (lib.rs),
> sharp output docs (XMP unsupported on AVIF), piexifjs issue tracker (WebP
> corruption), ExifReader/exifr (read-only).
