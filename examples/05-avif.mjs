// AVIF metadata write — the headline capability.
//
//   node examples/05-avif.mjs
//
// Writes XMP into an AVIF without re-encoding the image. No other pure-JS,
// zero-dependency library does this. The same API works for WebP and AVIF —
// the format is detected from the bytes.
import { writeMetadata, readMetadata, detectFormat } from "../src/index.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const inPath = fileURLToPath(new URL("../test/fixtures/sample.avif", import.meta.url));
const outPath = fileURLToPath(new URL("./out.avif", import.meta.url));

const input = new Uint8Array(readFileSync(inPath));
console.log("format:", detectFormat(input)); // avif
console.log("before:", readMetadata(input)); // {}

const output = writeMetadata(input, {
  description: "Aerial view of terraced rice paddies at dawn",
  title: "Rice Terraces",
  keywords: ["agriculture", "aerial", "rice", "landscape"],
  altText: "Green stepped rice fields curving along a hillside in morning light",
  creator: "Jane Doe",
  rights: "© 2026 Example Studio",
});

writeFileSync(outPath, output);
console.log(`\nWrote ${output.length} bytes → ${outPath}`);
console.log("after: ", readMetadata(output));
console.log(
  "\nThe AV1-compressed image data is relocated byte-for-byte — pixels unchanged.",
);
console.log("Verify externally:  exiftool examples/out.avif");
