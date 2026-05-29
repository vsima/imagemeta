import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  readMetadata,
  writeMetadata,
  removeMetadata,
  detectFormat,
} from "../src/index.ts";

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))),
  );

const SAMPLE = fixture("sample.heic"); // plain HEVC HEIC, no metadata
const TAGGED = fixture("tagged.heic"); // XMP written by ImageMagick (independent)

const META = {
  description: "A test HEIC write",
  title: "HEIC Write",
  keywords: ["heic", "hevc", "test"],
  altText: "alt",
  creator: "imagemeta",
  rights: "© 2026",
};

// NOTE: HEIC and AVIF share the ISOBMFF container, so they use the same engine.
// This suite covers the single-image case with committed fixtures. The hard
// multi-item cases (grids, overlays, idat, thumbnails, derived images) were
// validated against the Nokia HEIF conformance suite — see docs/avif-format.md.
// Those files are © Nokia and are not committed here.

test("detects HEIC as a first-class format", () => {
  assert.equal(detectFormat(SAMPLE), "heic");
  assert.equal(detectFormat(TAGGED), "heic");
});

test("reads XMP written by an independent tool (ImageMagick HEIC)", () => {
  const m = readMetadata(TAGGED);
  assert.equal(m.description, "Independent HEIC fixture");
  assert.equal(m.title, "HEIC Sample");
  assert.deepEqual(m.keywords, ["heic", "test"]);
});

test("plain HEIC reads as empty", () => {
  assert.deepEqual(readMetadata(SAMPLE), {});
});

test("writes into HEIC and round-trips all fields", () => {
  const out = writeMetadata(SAMPLE, META);
  assert.deepEqual(readMetadata(out), META);
});

test("written HEIC stays an ISOBMFF image with meta + mdat", () => {
  const out = writeMetadata(SAMPLE, META);
  assert.equal(detectFormat(out), "heic");
  const td = new TextDecoder("latin1");
  assert.ok(td.decode(out).includes("meta"));
  assert.ok(td.decode(out).includes("mdat"));
});

test("re-writing replaces rather than duplicates the XMP item", () => {
  const once = writeMetadata(SAMPLE, META);
  const twice = writeMetadata(once, { description: "replaced" });
  const td = new TextDecoder("latin1");
  const items = td.decode(twice).split("application/rdf+xml").length - 1;
  assert.equal(items, 1);
  assert.deepEqual(readMetadata(twice), { description: "replaced" });
});

test("removeMetadata strips the XMP item", () => {
  const tagged = writeMetadata(SAMPLE, { description: "secret" });
  assert.deepEqual(readMetadata(tagged), { description: "secret" });
  assert.deepEqual(readMetadata(removeMetadata(tagged)), {});
});

test("input buffer is never mutated", () => {
  const copy = SAMPLE.slice();
  writeMetadata(SAMPLE, META);
  assert.deepEqual(SAMPLE, copy);
});
