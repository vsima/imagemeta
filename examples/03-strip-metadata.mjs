// Strip metadata for privacy (e.g. before publishing user uploads).
//
//   node examples/03-strip-metadata.mjs
//
// removeMetadata() deletes XMP/EXIF while preserving the pixels and the ICC
// colour profile. The image is never re-encoded.
import { writeMetadata, removeMetadata, readMetadata } from "../src/index.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../test/fixtures/simple.webp", import.meta.url));
const original = new Uint8Array(readFileSync(path));

// Simulate a file that arrived with sensitive metadata.
const tagged = writeMetadata(original, {
  description: "Family photo",
  keywords: ["home address visible", "kids"],
  creator: "Jane Doe",
});
console.log("Before strip:", readMetadata(tagged));

const cleaned = removeMetadata(tagged);
console.log("After strip: ", readMetadata(cleaned)); // {}

console.log(
  `\nRemoved ${tagged.length - cleaned.length} bytes of metadata; ` +
    `image data untouched.`,
);
