# Architecture

The library is built around one idea: **the metadata payload is the same across
every image format; only the container plumbing differs.** So there is one
format-agnostic core and a set of thin per-format adapters.

```
                 ┌─────────────────────────────┐
   ImageMetadata │  src/xmp/serialize.ts        │  XMP packet (UTF-8 XML text)
   ──────────────▶  src/xmp/parse.ts            ◀──────────────
   (semantic)     └─────────────────────────────┘
                                │  the packet is just bytes
                                ▼
        ┌───────────────────────────────────────────────┐
        │  Format adapter: locate slot + splice + re-emit │
        │  src/formats/webp.ts   (JPEG/PNG/AVIF to come)  │
        └───────────────────────────────────────────────┘
                                │
                                ▼
                     new Uint8Array (pixels preserved)
```

## Layers

### 1. Semantic model (`src/types.ts`)

`ImageMetadata` is deliberately **not** a raw tag map. Consumers think in terms
of `description`, `keywords`, `altText` — the things answer engines read — and
the library owns the mapping to XMP namespaces. This keeps the public API stable
even as the underlying standards evolve.

### 2. XMP core (`src/xmp/`)

XMP is RDF/XML **text**. Unlike EXIF, it has no internal byte-offset pointers, so
building and editing it is safe string work with no risk of the offset-corruption
hazards that plague binary EXIF/MakerNote writers.

- `serialize.ts` builds a standards-compliant `xpacket`-wrapped packet from an
  `ImageMetadata` object. Values are XML-escaped. Absent fields are omitted.
- `parse.ts` is a **pragmatic extractor**, not a full RDF parser (which would be
  a dependency). It targets the specific properties we model and round-trips
  losslessly with `serialize.ts`. It also reads third-party packets it didn't
  author. Unknown properties are ignored on read and never corrupted.

This is the byte-for-byte identical payload regardless of destination container.

### 3. Format adapters (`src/formats/`)

Each adapter implements the same contract:

| Step | Responsibility |
| --- | --- |
| **Parse** | Walk the container into its blocks/segments/boxes — without decoding image data. |
| **Locate** | Find the metadata slot, or decide where to create one. |
| **Splice** | Insert/replace the XMP packet; copy everything else verbatim. |
| **Re-emit** | Rebuild the file, fixing length/size/offset fields. |

The **byte-preservation invariant** is enforced here: the compressed image
block is copied unchanged. We never call a codec.

### 4. Dispatch (`src/index.ts`)

`detectFormat` reads magic bytes; `readMetadata`/`writeMetadata`/`removeMetadata`
dispatch to the right adapter, or throw a typed `UnsupportedFormatError` for
formats not yet implemented. **Failing loudly beats corrupting silently.**

## Why this shape

- **Adding a format is additive and low-risk** — a new adapter file plus two
  switch cases. The XMP core and the public API are untouched.
- **The hard, format-specific work is isolated.** For example, AVIF's
  `iloc` offset recalculation (see [`roadmap.md`](roadmap.md)) lives entirely in
  its adapter and can't destabilize WebP.
- **Immutability** — every public function returns a new buffer; inputs are
  never mutated, which makes the library safe to use on shared/cached buffers in
  concurrent serverless environments.

## Runtime assumptions

The core uses only `Uint8Array`, `DataView`, `TextEncoder`, and `TextDecoder` —
all available in Node, Deno, Bun, browsers, and edge runtimes. There is no
dependency on `node:fs` or any Node built-in in the library itself; callers
supply and persist buffers however they like.
