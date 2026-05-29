# Examples

Runnable with Node 22+ (which executes TypeScript sources directly). From the
repo root:

```bash
node examples/01-read-write.mjs      # tag an image, read it back
node examples/02-aeo-batch.mjs       # batch-tag a folder for AEO
node examples/03-strip-metadata.mjs  # strip metadata for privacy
node examples/04-cloud-function.mjs  # edge/serverless handler (+ local smoke test)
```

These import from `../src/index.ts` so they run against the live source. In your
own project, import from the package instead:

```js
import { writeMetadata, readMetadata, removeMetadata, detectFormat } from "imagemeta";
```

Generated output (`out.webp`, `tagged/`) is git-ignored. Verify embedded XMP
with an independent tool:

```bash
identify -verbose examples/out.webp | grep -i xmp   # ImageMagick
```
