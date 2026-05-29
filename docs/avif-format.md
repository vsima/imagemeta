# AVIF / HEIC container & how we write metadata

AVIF and HEIC are [ISOBMFF](https://en.wikipedia.org/wiki/ISO_base_media_file_format)
files — the same box-based container as MP4. This is the hardest format
`imagemeta` supports, and the reason the library is differentiated: no other
pure-JS library writes XMP to AVIF. This doc explains the implementation in
`src/formats/avif.ts` (and the shared `isobmff.ts`).

## Boxes

Every box is:

```
size (4, big-endian) | type (4 ASCII) | payload
```

- `size === 1` → a 64-bit `largesize` follows the type (header becomes 16 bytes).
- `size === 0` → the box runs to end of file.
- A **FullBox** prepends `version (1) + flags (3)` to its payload.

A typical AVIF:

```
ftyp                      brand 'avif'
meta (FullBox)
  hdlr                    handler 'pict'
  pitm                    primary item id
  iloc                    item locations (offsets/lengths into mdat)
  iinf                    item info  → infe per item
  iprp                    item properties (ipco/ipma: av1C, ispe, pixi…)
  iref                    item references (e.g. 'cdsc')   ← present once metadata exists
mdat                      media data (compressed image; and metadata bytes)
```

## Where XMP lives

XMP is not a chunk — it's an **item**:

1. An `infe` entry in `iinf` declares an item of `item_type = "mime"` with
   `content_type = "application/rdf+xml"`.
2. `iloc` gives that item's byte location — an extent (`offset`, `length`) into
   `mdat` (or into an `idat` box for construction method 1).
3. A `cdsc` ("content describes") entry in `iref` links the XMP item → the
   primary image item.

(EXIF is the same pattern with `item_type = "Exif"`.)

## Reading

1. Parse top-level boxes, find `meta`.
2. Parse `iinf` → `infe` entries; find the `mime` item whose content-type is
   `application/rdf+xml`.
3. Parse `iloc` (version-aware: field sizes for offset/length/base, item count
   width, and the construction-method nibble in v1/v2).
4. Follow the item's extents (method 0 → absolute file offset; 1 → into `idat`),
   concatenate, UTF-8 decode, parse the packet.

HEIC uses the identical structure, so reading it is free.

## Writing — the offset problem

`iloc` stores **absolute file offsets**. Adding an XMP item grows `meta`, which
pushes `mdat` later in the file — invalidating *every* existing offset, including
the primary image's. A naive insert corrupts the file so it won't decode.

`imagemeta` avoids fragile delta-patching with a **full rebuild**:

1. **Read every item's bytes** via the existing `iloc` (so we can relocate them).
2. **Regenerate `meta`:**
   - `iinf`: preserve existing `infe` boxes verbatim; append a new one for XMP
     (or reuse the existing XMP item on a re-write).
   - `iref`: preserve existing references; add a `cdsc` linking XMP → primary.
   - `iloc`: rewrite **all** entries as **version 0** (absolute offsets, 4-byte
     fields) — no construction-method ambiguity in the output.
   - Everything else in `meta` (`hdlr`, `pitm`, `iprp`, …) is copied byte-for-byte.
3. **Two-pass offset computation:** because the rewritten `iloc` uses fixed field
   widths, `meta`'s serialized length is constant regardless of the offset
   *values*. So we build `meta` once with placeholder offsets to learn its
   length, compute where `mdat` starts, lay out each item, then rebuild `meta`
   with the real offsets (same length).
4. **Fresh `mdat`:** concatenate all item data (image first, XMP last). Old
   `mdat`/`idat`/`free` boxes are dropped; a single new `mdat` is appended.

The compressed image bytes are relocated verbatim — **verified** in tests and
against ImageMagick: decoded pixels are byte-identical before and after a write.

## Removing

Same rebuild with the XMP (and EXIF) items excluded from `iinf`/`iloc`/`mdat`.

## HEIC

HEIC is the **same ISOBMFF container** as AVIF — only the codec configuration box
differs (`hvcC`/HEVC vs `av1C`/AV1), which is opaque to a metadata splice. So the
same reader and writer handle HEIC; `detectFormat` simply labels it `"heic"`
(by inspecting the `ftyp` major + compatible brands) and routes to the same code.

This was validated against the [Nokia HEIF conformance suite](https://github.com/nokiatech/heif_conformance)
(63 files). Every single- and multi-item **still image** writes and re-decodes
correctly in third-party decoders, including:

- **grid**-tiled images (derived `grid` item + N HEVC tiles), up to 11+ items;
- **overlay** (`iovl`) images;
- **thumbnails** (`thmb`), **auxiliary** images (`auxl`), **derived** refs (`dimg`);
- items stored in **`idat`** (construction method 1);
- files with an existing **Exif** item;
- a 21-item file.

Image **sequences** (brands `msf1`/`heis` with no `meta` box — bursts / animations)
store metadata in movie boxes (`moov`/`udta`), not `meta`, and are **out of
scope**: the writer refuses them with a clear error rather than corrupting them.
(Conformance files are © Nokia and are not committed to this repo; the test suite
ships self-generated HEIC fixtures.)

## Safety / limits

- If any item uses an unsupported construction method (item-relative, method 2),
  we **refuse to rewrite** rather than risk corruption.
- Output offsets are 32-bit; files that would exceed 4 GB throw instead of
  silently overflowing (not a real constraint for images).
- Item ids are emitted as 16-bit (`iloc`/`infe` v0/v2); overflow throws.
- The two-pass build asserts `meta` length is identical across passes — a
  tripwire against offset drift.

## Why this is the differentiator

Writing XMP to AVIF otherwise requires exiftool (a Perl binary) or a native
codec stack. Doing it in dependency-free JavaScript, without re-encoding, is the
capability that doesn't exist elsewhere in the ecosystem — see
[`landscape.md`](landscape.md).
