// Basic read / write round-trip.
//
//   node examples/01-read-write.mjs
//
// In your own project, import from the package instead of the source:
//   import { writeMetadata, readMetadata } from "imagemeta";
import { writeMetadata, readMetadata } from "../src/index.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const inPath = fileURLToPath(new URL("../test/fixtures/simple.webp", import.meta.url));
const outPath = fileURLToPath(new URL("./out.webp", import.meta.url));

const input = new Uint8Array(readFileSync(inPath));
console.log("Original metadata:", readMetadata(input)); // {}

const output = writeMetadata(input, {
  description: "A golden retriever catching a frisbee on a beach at sunset",
  title: "Frisbee Dog",
  keywords: ["dog", "beach", "sunset", "frisbee"],
  altText: "Brown dog mid-jump catching an orange frisbee",
  creator: "Victor Sima",
  credit: "Victory Studios",
  rights: "© 2026 Victory Studios",
});

writeFileSync(outPath, output);
console.log(`\nWrote ${output.length} bytes → ${outPath}`);
console.log("Read back:", readMetadata(output));
console.log(
  `\nPixels preserved: input image data is copied verbatim ` +
    `(size delta is only the XMP packet: ${output.length - input.length} bytes).`,
);
