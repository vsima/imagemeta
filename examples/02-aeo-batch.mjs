// Batch-tag a folder of images for AEO (Answer Engine Optimization).
//
//   node examples/02-aeo-batch.mjs
//
// Pattern: pair each image with descriptive metadata (here hard-coded; in a real
// pipeline this comes from your CMS, a manifest, or a vision model), then embed
// it losslessly. Non-WebP files are skipped with a clear message until those
// formats land.
import { writeMetadata, detectFormat } from "../src/index.ts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// image path → AEO metadata
const manifest = {
  "../test/fixtures/simple.webp": {
    description: "Innovid Super Bowl campaign creative",
    keywords: ["advertising", "super bowl", "ctv", "innovid"],
    altText: "Branded Super Bowl advertising creative",
  },
  // add more entries here…
};

const outDir = fileURLToPath(new URL("./tagged/", import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const [rel, meta] of Object.entries(manifest)) {
  const path = fileURLToPath(new URL(rel, import.meta.url));
  const buf = new Uint8Array(readFileSync(path));
  const format = detectFormat(buf);

  if (format !== "webp") {
    console.log(`⏭️  skip ${rel} (${format} not yet implemented)`);
    continue;
  }

  const tagged = writeMetadata(buf, meta);
  const name = rel.split("/").pop();
  writeFileSync(outDir + name, tagged);
  console.log(`✅ tagged ${name} → examples/tagged/${name} (+${tagged.length - buf.length} bytes)`);
}

console.log("\nDone. Verify with:  identify -verbose examples/tagged/*.webp | grep -i xmp");
