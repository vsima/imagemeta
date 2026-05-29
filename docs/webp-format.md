# WebP container & how we write metadata

WebP is a [RIFF](https://developers.google.com/speed/webp/docs/riff_container)
file. This doc explains the exact bytes the library reads and writes so the WebP
adapter (`src/formats/webp.ts`) is auditable.

## RIFF layout

```
offset  bytes  field
0       4      "RIFF"
4       4      file size − 8   (uint32, little-endian)
8       4      "WEBP"
12      ...    a flat sequence of chunks
```

Each **chunk**:

```
0   4   FourCC               e.g. "VP8 ", "VP8L", "VP8X", "ALPH", "EXIF", "XMP "
4   4   payload size (uint32 LE)
8   N   payload
        + 1 pad byte if N is odd   (chunks are 2-byte aligned)
```

> Note: the XMP FourCC is `"XMP "` **with a trailing space**.

## Three kinds of WebP

| Kind | Marker | Carries metadata? |
| --- | --- | --- |
| Simple lossy | `VP8 ` chunk only | No |
| Simple lossless | `VP8L` chunk only | No |
| **Extended** | `VP8X` header chunk first | Yes — metadata flags + `EXIF`/`XMP `/`ICCP` chunks |

A simple file has **no place to advertise metadata**. To tag one, we must
convert it to the extended form by synthesizing a `VP8X` header.

## The `VP8X` header (10-byte payload)

```
byte 0      flags
bytes 1–3   reserved (0)
bytes 4–6   canvas width  − 1   (24-bit LE)
bytes 7–9   canvas height − 1   (24-bit LE)
```

### Flag bits (byte 0, MSB-first)

```
bit  7 6 5 4 3 2 1 0
     R R I L E X A R
         │ │ │ │ └─ Animation
         │ │ │ └─── XMP        (0x04)
         │ │ └───── EXIF       (0x08)
         │ └─────── Alpha      (0x10)
         └───────── ICC profile(0x20)
```

We set `0x04` when writing XMP and clear `0x04`/`0x08` when stripping. Other
bits (ICC, Alpha, Animation) are preserved untouched.

## Reading canvas dimensions

When upgrading a simple file, the `VP8X` header needs the canvas size. We read it
directly from the bitstream — no decoding:

- **`VP8 ` (lossy):** after a 3-byte frame tag and the `0x9D 0x01 0x2A` start
  code, two little-endian 16-bit values hold width and height (14 bits each).
- **`VP8L` (lossless):** after the `0x2F` signature, the first 28 bits encode
  `width − 1` (14 bits) then `height − 1` (14 bits), LSB-first.
- **`VP8X`:** width/height are already in bytes 4–9.

## Write algorithm

1. `parseChunks` — split into `{ fourcc, data }`, honoring pad bytes.
2. `readDimensions` — from `VP8X`, else `VP8 `, else `VP8L`.
3. Drop any existing `XMP ` chunk (we're replacing it).
4. Ensure a `VP8X` exists (synthesize with dimensions if absent) and set the XMP
   flag bit. The `VP8X` chunk must be first.
5. Append the new `XMP ` chunk **after** the image data (spec-recommended
   placement for metadata).
6. `serialize` — write `RIFF`/size/`WEBP`, then each chunk with correct size and
   pad, and set the RIFF size field to `total − 8`.

The `VP8 `/`VP8L` image chunk is copied verbatim — this is what "byte-preserving"
means in practice, and it's asserted in the test suite.

## Chunk ordering

The extended-format ordering we emit:

```
VP8X, [ICCP], [ANIM/ANMF…], [ALPH], VP8 |VP8L, [EXIF], [XMP ]
```

`VP8X` first; metadata chunks last. We preserve the relative order of chunks we
don't manage.

## Edge cases handled

- **Re-tagging** removes the prior `XMP ` chunk first, so files never accumulate
  duplicate metadata.
- **Odd-length payloads** get their pad byte on both read and write.
- **Truncated/short files** stop parsing gracefully rather than reading OOB.
- **UTF-8** — XMP payloads are decoded/encoded as UTF-8 (FourCCs stay ASCII), so
  non-ASCII captions (e.g. `©`, accented text) round-trip correctly.
