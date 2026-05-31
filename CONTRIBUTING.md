# Contributing

Thanks for your interest! This project's mission is a **zero-dependency,
byte-preserving** metadata library, so contributions are held to two hard rules:

1. **No runtime dependencies.** `dependencies` in `package.json` must stay empty.
   Dev dependencies (TypeScript, etc.) are fine.
2. **Never re-encode pixels.** Writers splice metadata blocks only. The
   compressed image data must be copied byte-for-byte. Any change that decodes
   or re-encodes image data will be rejected.

## Getting started

```bash
git clone https://github.com/vsima/aeo-image
cd aeo-image
npm install        # installs TypeScript (dev only)
npm test           # Node's built-in runner; runs .ts directly on Node 22+
npm run typecheck
```

No build step is needed to run tests — Node strips TypeScript types natively.

## Project layout

```
src/
  index.ts            # public API + format dispatch
  types.ts            # ImageMetadata, ImageFormat, errors
  xmp/
    serialize.ts      # ImageMetadata → XMP packet
    parse.ts          # XMP packet → ImageMetadata
  formats/
    webp.ts           # WebP container engine (read/write/remove)
test/                 # node:test specs + real image fixtures
docs/                 # architecture & format deep-dives
examples/             # runnable usage scripts
```

## Adding a format

Each format is a thin adapter over the shared XMP core. The pattern (see
`src/formats/webp.ts`) is:

1. **Parse** the container into its block/segment/box structure.
2. **Locate** the metadata slot (or determine where to create one).
3. **Splice** the XMP packet in, preserving everything else byte-for-byte.
4. **Re-emit**, fixing any length/size/offset fields.
5. Wire it into `detectFormat` and the dispatch switches in `src/index.ts`.

Then add round-trip tests with a **real** fixture image for that format. See
[`docs/architecture.md`](docs/architecture.md) and
[`docs/roadmap.md`](docs/roadmap.md) for format-specific notes (especially the
AVIF `iloc` offset-recalculation hazard).

## Testing standards

- Every format needs a real-file round-trip test (not a synthetic buffer).
- Assert **byte-level pixel preservation** (the image chunk/segment is identical
  before and after a metadata write).
- Validate structural integrity (sizes/offsets land exactly on EOF).
- Where possible, verify output parses in an independent tool (ImageMagick,
  `sips`, exiftool) in CI or locally.

## Commit / PR

- Keep PRs focused (one format or one fix).
- Update `CHANGELOG.md` under `[Unreleased]`.
- Run `npm test` and `npm run typecheck` before pushing.
