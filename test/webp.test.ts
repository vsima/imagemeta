import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  readMetadata,
  writeMetadata,
  detectFormat,
} from "../src/index.ts";

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))),
  );

const SIMPLE = fixture("simple.webp"); // plain VP8 (lossy), no VP8X
const EXTENDED = fixture("extended.webp"); // already VP8X (+ALPH)

const SAMPLE = {
  description: "A golden retriever catching a frisbee on a beach at sunset",
  title: "Frisbee Dog",
  keywords: ["dog", "beach", "sunset", "frisbee & fun <test>"],
  creator: "Victor Sima",
  altText: "Brown dog mid-jump catching an orange frisbee",
  credit: "Victory Studios",
  rights: "© 2026 Victory Studios",
};

test("fixtures are detected as webp", () => {
  assert.equal(detectFormat(SIMPLE), "webp");
  assert.equal(detectFormat(EXTENDED), "webp");
});

test("round-trips all fields through a simple (VP8) file", () => {
  const out = writeMetadata(SIMPLE, SAMPLE);
  const read = readMetadata(out);
  assert.deepEqual(read, SAMPLE);
});

test("round-trips through an already-extended (VP8X) file", () => {
  const out = writeMetadata(EXTENDED, SAMPLE);
  const read = readMetadata(out);
  assert.deepEqual(read, SAMPLE);
});

test("output is a structurally valid WebP (RIFF size + chunk framing)", () => {
  const out = writeMetadata(SIMPLE, SAMPLE);
  const td = new TextDecoder("latin1");
  assert.equal(td.decode(out.subarray(0, 4)), "RIFF");
  assert.equal(td.decode(out.subarray(8, 12)), "WEBP");

  // RIFF size field must equal (file length - 8).
  const riffSize =
    (out[4]! | (out[5]! << 8) | (out[6]! << 16)) + out[7]! * 0x1000000;
  assert.equal(riffSize, out.length - 8);

  // Walk every chunk; total must land exactly on EOF (no drift/overrun).
  let off = 12;
  let sawVp8x = false;
  let sawXmp = false;
  while (off + 8 <= out.length) {
    const fourcc = td.decode(out.subarray(off, off + 4));
    const size =
      (out[off + 4]! | (out[off + 5]! << 8) | (out[off + 6]! << 16)) +
      out[off + 7]! * 0x1000000;
    if (fourcc === "VP8X") sawVp8x = true;
    if (fourcc === "XMP ") sawXmp = true;
    off += 8 + size + (size & 1);
  }
  assert.equal(off, out.length, "chunk walk must end exactly at EOF");
  assert.ok(sawVp8x, "extended header (VP8X) must be present");
  assert.ok(sawXmp, "XMP chunk must be present");
});

test("VP8X advertises the XMP flag", () => {
  const out = writeMetadata(SIMPLE, SAMPLE);
  const td = new TextDecoder("latin1");
  let off = 12;
  while (off + 8 <= out.length) {
    const fourcc = td.decode(out.subarray(off, off + 4));
    const size =
      (out[off + 4]! | (out[off + 5]! << 8) | (out[off + 6]! << 16)) +
      out[off + 7]! * 0x1000000;
    if (fourcc === "VP8X") {
      assert.equal(out[off + 8]! & 0x04, 0x04, "XMP flag bit must be set");
    }
    off += 8 + size + (size & 1);
  }
});

test("pixels are byte-preserved: the original VP8 chunk is unchanged", () => {
  const out = writeMetadata(SIMPLE, SAMPLE);
  const td = new TextDecoder("latin1");

  const findChunk = (b: Uint8Array, target: string): Uint8Array | null => {
    let off = 12;
    while (off + 8 <= b.length) {
      const fourcc = td.decode(b.subarray(off, off + 4));
      const size =
        (b[off + 4]! | (b[off + 5]! << 8) | (b[off + 6]! << 16)) +
        b[off + 7]! * 0x1000000;
      if (fourcc === target) return b.subarray(off + 8, off + 8 + size);
      off += 8 + size + (size & 1);
    }
    return null;
  };

  const before = findChunk(SIMPLE, "VP8 ");
  const after = findChunk(out, "VP8 ");
  assert.ok(before && after);
  assert.deepEqual(after, before, "compressed image data must be identical");
});

test("re-writing replaces rather than duplicates the XMP chunk", () => {
  const once = writeMetadata(SIMPLE, SAMPLE);
  const twice = writeMetadata(once, { description: "replaced" });
  const td = new TextDecoder("latin1");
  let count = 0;
  let off = 12;
  while (off + 8 <= twice.length) {
    const fourcc = td.decode(twice.subarray(off, off + 4));
    const size =
      (twice[off + 4]! | (twice[off + 5]! << 8) | (twice[off + 6]! << 16)) +
      twice[off + 7]! * 0x1000000;
    if (fourcc === "XMP ") count++;
    off += 8 + size + (size & 1);
  }
  assert.equal(count, 1, "exactly one XMP chunk after re-write");
  assert.deepEqual(readMetadata(twice), { description: "replaced" });
});

test("reading a file with no metadata returns an empty object", () => {
  assert.deepEqual(readMetadata(SIMPLE), {});
});

test("input buffer is never mutated", () => {
  const copy = SIMPLE.slice();
  writeMetadata(SIMPLE, SAMPLE);
  assert.deepEqual(SIMPLE, copy);
});
