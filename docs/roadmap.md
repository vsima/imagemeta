# Roadmap

v1 ships WebP read/write/remove. The remaining formats are sequenced by
risk — easiest and most reusable first, the one genuinely hard piece last.

## Order & rationale

### ✅ WebP — done
Flat RIFF chunks, no offset math. Proves the splice engine and the
simple→extended upgrade pattern.

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

### 🔜 AVIF / HEIC — read first
- **Slot:** XMP is an item (`infe` type `mime`, content-type
  `application/rdf+xml`) whose bytes are located via the `iloc` box.
- **Work:** parse the ISOBMFF box tree
  (`ftyp → meta → {hdlr, pitm, iinf, iref, iprp, iloc, idat}`), follow the item's
  `iloc` extents, decode the packet.
- **Risk:** moderate. Mostly careful box-tree walking. HEIC read comes free.

### 🔜 AVIF / HEIC — write  *(the hard one)*
This is the largest single piece in the project.
- To add XMP you must synthesize an `infe` entry, bump `iinf`, add an `iref`
  (`cdsc`) linking the item to the primary image, add an `iloc` extent, and
  append the packet to `mdat`/`idat`.
- **The hazard:** `iloc` stores **absolute file offsets**. Inserting bytes
  shifts `mdat`, so **every `iloc` offset for every item must be recalculated**.
  Get it wrong and the file won't decode at all.
- **Versioning:** `meta`/`iinf`/`iloc` are FullBoxes; `iloc` offset/length field
  sizes are configurable (0/4/8 bytes) and must be respected or rewritten
  consistently.
- **Mitigation:** heaviest test investment — a corpus of real AVIF/HEIC files
  from multiple encoders, with full decode verification after every write.

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
