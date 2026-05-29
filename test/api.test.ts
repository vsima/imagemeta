import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  detectFormat,
  readMetadata,
  writeMetadata,
  removeMetadata,
  UnsupportedFormatError,
} from "../src/index.ts";

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))),
  );

const SIMPLE = fixture("simple.webp");

// Minimal magic-byte headers for format detection.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const AVIF = new Uint8Array([
  0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
]); // ....ftypavif
const GARBAGE = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

test("detectFormat identifies formats by magic bytes", () => {
  assert.equal(detectFormat(SIMPLE), "webp");
  assert.equal(detectFormat(JPEG), "jpeg");
  assert.equal(detectFormat(PNG), "png");
  assert.equal(detectFormat(AVIF), "avif");
  assert.equal(detectFormat(GARBAGE), "unknown");
});

test("unknown/unsupported formats throw a typed, helpful error", () => {
  assert.throws(
    () => readMetadata(GARBAGE),
    (e: unknown) => {
      assert.ok(e instanceof UnsupportedFormatError);
      assert.equal(e.format, "unknown");
      return true;
    },
  );
  assert.throws(() => writeMetadata(GARBAGE, { title: "x" }), UnsupportedFormatError);
});

test("removeMetadata strips XMP and is idempotent", () => {
  const tagged = writeMetadata(SIMPLE, { description: "secret location" });
  assert.deepEqual(readMetadata(tagged), { description: "secret location" });

  const stripped = removeMetadata(tagged);
  assert.deepEqual(readMetadata(stripped), {});

  // Stripping again changes nothing.
  assert.deepEqual(readMetadata(removeMetadata(stripped)), {});
});

test("removeMetadata clears the VP8X XMP flag", () => {
  const tagged = writeMetadata(SIMPLE, { description: "x" });
  const stripped = removeMetadata(tagged);
  const td = new TextDecoder("latin1");
  let off = 12;
  while (off + 8 <= stripped.length) {
    const fourcc = td.decode(stripped.subarray(off, off + 4));
    const size =
      (stripped[off + 4]! |
        (stripped[off + 5]! << 8) |
        (stripped[off + 6]! << 16)) +
      stripped[off + 7]! * 0x1000000;
    if (fourcc === "VP8X") assert.equal(stripped[off + 8]! & 0x04, 0);
    assert.notEqual(fourcc, "XMP ", "no XMP chunk should remain");
    off += 8 + size + (size & 1);
  }
});
