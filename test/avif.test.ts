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

const SAMPLE = fixture("sample.avif"); // 320x180, no metadata
const TINY = fixture("tiny.avif"); // 16x16, no metadata
const TAGGED = fixture("tagged.avif"); // XMP written by ImageMagick (independent)

const META = {
  description: "A test AVIF write",
  title: "AVIF Write",
  keywords: ["avif", "xmp", "write"],
  altText: "alt here",
  creator: "imagemeta",
  rights: "© 2026",
  credit: "Studio",
};

const countXmpItems = (b: Uint8Array): number => {
  const text = new TextDecoder("latin1").decode(b);
  return text.split("application/rdf+xml").length - 1;
};
const hasBox = (b: Uint8Array, type: string): boolean =>
  new TextDecoder("latin1").decode(b).includes(type);

test("detects AVIF by ftyp brand", () => {
  assert.equal(detectFormat(SAMPLE), "avif");
  assert.equal(detectFormat(TINY), "avif");
  assert.equal(detectFormat(TAGGED), "avif");
});

test("reads XMP written by an independent tool (ImageMagick)", () => {
  const meta = readMetadata(TAGGED);
  assert.equal(meta.description, "Independent AVIF read fixture");
  assert.equal(meta.title, "AVIF Sample");
  assert.deepEqual(meta.keywords, ["avif", "test"]);
  assert.equal(meta.creator, "ImageMagick");
});

test("plain AVIF reads as empty metadata", () => {
  assert.deepEqual(readMetadata(SAMPLE), {});
  assert.deepEqual(readMetadata(TINY), {});
});

test("writes into a plain AVIF and round-trips all fields", () => {
  const out = writeMetadata(SAMPLE, META);
  assert.deepEqual(readMetadata(out), META);
});

test("written AVIF stays structurally an AVIF with meta + mdat", () => {
  const out = writeMetadata(SAMPLE, META);
  assert.equal(detectFormat(out), "avif");
  assert.ok(hasBox(out, "meta"));
  assert.ok(hasBox(out, "mdat"));
  assert.ok(hasBox(out, "iloc"));
  assert.ok(hasBox(out, "iref"), "a cdsc reference (iref) must link XMP→image");
});

test("re-writing replaces rather than duplicates the XMP item", () => {
  const once = writeMetadata(SAMPLE, META);
  const twice = writeMetadata(once, { description: "replaced", keywords: ["x"] });
  assert.equal(countXmpItems(twice), 1, "exactly one XMP item after rewrite");
  assert.deepEqual(readMetadata(twice), {
    description: "replaced",
    keywords: ["x"],
  });
});

test("removeMetadata strips the XMP item", () => {
  const tagged = writeMetadata(SAMPLE, { description: "secret" });
  assert.deepEqual(readMetadata(tagged), { description: "secret" });
  const stripped = removeMetadata(tagged);
  assert.deepEqual(readMetadata(stripped), {});
  assert.equal(countXmpItems(stripped), 0);
});

test("works on a 16x16 image (tiny mdat, offset recalculation)", () => {
  const out = writeMetadata(TINY, { description: "tiny tagged", keywords: ["a"] });
  assert.deepEqual(readMetadata(out), {
    description: "tiny tagged",
    keywords: ["a"],
  });
});

test("input buffer is never mutated", () => {
  const copy = SAMPLE.slice();
  writeMetadata(SAMPLE, META);
  assert.deepEqual(SAMPLE, copy);
});

test("the original compressed image bytes survive the rewrite", () => {
  // The tail of the original mdat (image data) must appear verbatim in output.
  const out = writeMetadata(SAMPLE, META);
  // Grab a distinctive 64-byte slice from deep in the original file's mdat.
  const probe = SAMPLE.subarray(SAMPLE.length - 128, SAMPLE.length - 64);
  const hay = out;
  let found = false;
  for (let i = 0; i + probe.length <= hay.length && !found; i++) {
    let match = true;
    for (let j = 0; j < probe.length; j++)
      if (hay[i + j] !== probe[j]) {
        match = false;
        break;
      }
    if (match) found = true;
  }
  assert.ok(found, "original image bytes must be preserved verbatim");
});
