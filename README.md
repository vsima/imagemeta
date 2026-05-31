# aeo-image

> Write descriptive metadata — captions, keywords, alt text — into **WebP, AVIF, HEIC, JPEG & PNG** so AI answer engines (ChatGPT, Perplexity, Google AI Overviews) and search can read your images. The only pure-JS, **zero-dependency** library that writes XMP to AVIF/HEIC. **Byte-preserving** (never re-encodes). Runs on Node, Bun, Deno & edge.

[![CI](https://github.com/vsima/aeo-image/actions/workflows/ci.yml/badge.svg)](https://github.com/vsima/aeo-image/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/aeo-image.svg)](https://www.npmjs.com/package/aeo-image)
[![install size](https://packagephobia.com/badge?p=aeo-image)](https://packagephobia.com/result?p=aeo-image)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://github.com/vsima/aeo-image/blob/main/scripts/check-zero-deps.mjs)
[![provenance](https://img.shields.io/badge/npm-provenance-blue)](https://www.npmjs.com/package/aeo-image#provenance)
![types](https://img.shields.io/badge/types-included-blue)
![license](https://img.shields.io/badge/license-MIT-green)

```ts
import { writeMetadata, readMetadata } from "aeo-image";

const tagged = writeMetadata(webpBytes, {
  description: "A golden retriever catching a frisbee on a beach at sunset",
  keywords: ["dog", "beach", "sunset"],
  altText: "Brown dog mid-jump catching an orange frisbee",
});

readMetadata(tagged);
// → { description: "...", keywords: ["dog","beach","sunset"], altText: "..." }
```

The image pixels are **never re-encoded**. Only the metadata block is spliced in.

---

## Why this exists

Answer engines (ChatGPT, Perplexity, Google AI Overviews) and image search read **descriptive metadata** — captions, keywords, alt text — embedded directly in image files. That metadata lives in **XMP**, an XML packet inside the container.

Today, writing XMP into modern web image formats from JavaScript means one of:

| Option | Problem |
| --- | --- |
| `exiftool` (Perl) / wrappers | Requires a binary; won't run in a sandboxed cloud function |
| `sharp` (libvips) | Native dependency **and** re-encodes your pixels — quality loss; cannot even write XMP to AVIF |
| `piexifjs` | JPEG-first; WebP write is buggy; no AVIF |
| `exifr` / `ExifReader` | Read-only |

**No other pure-JS, zero-dependency library *writes* descriptive metadata into WebP and AVIF without re-encoding** — not even sharp can write XMP to AVIF. `aeo-image` does. See [`docs/landscape.md`](docs/landscape.md) for the full competitive analysis.

## Features

- 📦 **Zero runtime dependencies** — pure TypeScript over `Uint8Array`/`DataView`.
- 🖼️ **Byte-preserving** — splices metadata only; compressed image data is copied verbatim, never re-encoded.
- 🧠 **Semantic, AEO-oriented API** — you write `description`/`keywords`/`altText`, not raw tag IDs. We map them onto the correct XMP namespaces (`dc:`, `photoshop:`, `Iptc4xmpCore:`, `xmpRights:`).
- ☁️ **Runs anywhere** — Node, Deno, Bun, Cloudflare Workers, Vercel/Netlify/Lambda edge functions. No `fs` required; operates on buffers.
- 🔒 **Privacy-friendly** — `removeMetadata()` strips XMP/EXIF in one call (keeps ICC colour profile).
- 🧩 **ESM, fully typed** — and `require()`-able on Node ≥ 20.19 / 22.12.

## Format support

| Format | Read | Write | Status |
| --- | :---: | :---: | --- |
| **WebP** | ✅ | ✅ | Implemented & tested (simple + extended) |
| **AVIF** | ✅ | ✅ | Implemented & tested (ISOBMFF item + full `iloc` offset recalculation) |
| **HEIC** | ✅ | ✅ | Implemented & tested (shares AVIF's ISOBMFF engine; validated against the Nokia HEIF conformance suite) |
| **JPEG** | ✅ | ✅ | Implemented & tested (APP1 segment splice) |
| **PNG** | ✅ | ✅ | Implemented & tested (standard `iTXt`, CRC-correct) |

All four major web image formats are supported. An unrecognized format throws a typed `UnsupportedFormatError` rather than risking silent corruption. See [`docs/roadmap.md`](docs/roadmap.md).

## Install

```bash
npm install aeo-image
```

Requires Node ≥ 20 (or any modern runtime with `TextEncoder`/`Uint8Array`).

## Usage

### Read

```ts
import { readMetadata } from "aeo-image";
import { readFileSync } from "node:fs";

const meta = readMetadata(new Uint8Array(readFileSync("photo.webp")));
console.log(meta.description, meta.keywords);
```

### Write (tag for AEO)

```ts
import { writeMetadata } from "aeo-image";
import { readFileSync, writeFileSync } from "node:fs";

const input = new Uint8Array(readFileSync("photo.webp"));
const output = writeMetadata(input, {
  description: "Solar panels on a barn roof in rural Vermont",
  title: "Rural Solar Install",
  keywords: ["solar", "renewable energy", "Vermont", "agrivoltaics"],
  altText: "Rows of black solar panels mounted on a red barn roof",
  creator: "Jane Doe",
  credit: "Example Studio",
  rights: "© 2026 Example Studio",
});
writeFileSync("photo.tagged.webp", output);
```

### Strip (privacy)

```ts
import { removeMetadata } from "aeo-image";
const clean = removeMetadata(input); // removes XMP/EXIF, keeps pixels + ICC
```

### Detect format

```ts
import { detectFormat } from "aeo-image";
detectFormat(buf); // "webp" | "jpeg" | "png" | "avif" | "heic" | "unknown"
```

## API

| Function | Signature | Description |
| --- | --- | --- |
| `readMetadata` | `(buf: Uint8Array) => ImageMetadata` | Read semantic metadata. |
| `writeMetadata` | `(buf: Uint8Array, meta: ImageMetadata) => Uint8Array` | Return a new buffer with metadata written; pixels preserved. |
| `removeMetadata` | `(buf: Uint8Array) => Uint8Array` | Return a new buffer with XMP/EXIF stripped. |
| `detectFormat` | `(buf: Uint8Array) => ImageFormat` | Identify the container by magic bytes. |
| `serializeXmp` | `(meta: ImageMetadata) => string` | Build a standalone XMP packet (advanced). |
| `parseXmp` | `(xmp: string) => ImageMetadata` | Parse a standalone XMP packet (advanced). |

### `ImageMetadata`

| Field | Type | Maps to |
| --- | --- | --- |
| `description` | `string` | `dc:description` (x-default) |
| `title` | `string` | `dc:title` (x-default) |
| `keywords` | `string[]` | `dc:subject` (rdf:Bag) |
| `creator` | `string` | `dc:creator` (rdf:Seq) |
| `rights` | `string` | `dc:rights` (x-default) |
| `altText` | `string` | `Iptc4xmpCore:AltTextAccessibility` — *the field Google reads* |
| `credit` | `string` | `photoshop:Credit` |

All functions return a **new** buffer and never mutate the input. See [`docs/xmp-fields.md`](docs/xmp-fields.md) for the complete field/namespace reference and AEO rationale.

## How it works

WebP is a [RIFF](https://developers.google.com/speed/webp/docs/riff_container) container: a 12-byte header followed by a flat list of chunks. Metadata lives in a dedicated `XMP ` chunk. Writing it means:

1. Parse the chunk list (no decoding of image data).
2. If the file is "simple" (`VP8 `/`VP8L`), synthesize the extended-format `VP8X` header it needs to carry metadata — reading canvas dimensions straight from the bitstream.
3. Set the XMP presence flag bit in `VP8X`.
4. Splice in the `XMP ` chunk and recompute the RIFF size.

The compressed image chunk is copied byte-for-byte.

**JPEG** stores XMP in an `APP1` marker segment (signature `http://ns.adobe.com/xap/1.0/\0`); **PNG** uses a standard `iTXt` chunk (`XML:com.adobe.xmp`, CRC-32 recomputed). Both follow the same splice pattern — locate/replace the metadata block, copy everything else (including the entropy-coded scan / IDAT data) byte-for-byte.

**AVIF and HEIC** are harder: they're [ISOBMFF](https://en.wikipedia.org/wiki/ISO_base_media_file_format) box trees (same container, different codec) where XMP is an *item* whose bytes are located via absolute file offsets in the `iloc` box. Inserting metadata shifts `mdat`, invalidating every offset — so `aeo-image` reads each item's bytes, emits a fresh `meta` (regenerated `iinf`/`iloc`/`iref`) and `mdat`, and recomputes all offsets from the new layout. The compressed image data is relocated verbatim (verified: decoded pixels are byte-identical before and after). The same engine handles HEIC, and was validated against the full [Nokia HEIF conformance suite](https://github.com/nokiatech/heif_conformance) — including grid-tiled, overlay, thumbnail, and multi-item files.

Read [`docs/architecture.md`](docs/architecture.md), [`docs/webp-format.md`](docs/webp-format.md), and [`docs/avif-format.md`](docs/avif-format.md) for the deep dives.

## Examples

Runnable scripts in [`examples/`](examples/):

- [`01-read-write.mjs`](examples/01-read-write.mjs) — tag an image and read it back.
- [`02-aeo-batch.mjs`](examples/02-aeo-batch.mjs) — batch-tag a folder of images for AEO.
- [`03-strip-metadata.mjs`](examples/03-strip-metadata.mjs) — strip metadata for privacy.
- [`04-cloud-function.mjs`](examples/04-cloud-function.mjs) — request handler shape for edge/serverless.

```bash
node examples/01-read-write.mjs
```

## Development

```bash
npm test          # run the test suite (Node's built-in runner, no install needed on Node 22+)
npm run typecheck # type-check without emitting
npm run build     # emit ESM + .d.ts to dist/
```

Tests run real `.webp` fixtures through full round-trips and validate RIFF framing, flag bits, and byte-level pixel preservation. Output is independently verified to parse in **exiftool** (in CI), and has been checked against ImageMagick and Apple's imaging stack.

## Contributing

Implementing JPEG, PNG, and AVIF is the active roadmap — see [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/roadmap.md`](docs/roadmap.md). The architecture is designed so each new format is a thin adapter over a shared container/splice core.

## License

[MIT](LICENSE)
