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

const META = {
  description: "JPEG/PNG metadata test",
  title: "Title",
  keywords: ["alpha", "beta", "gamma & delta <x>"],
  altText: "alt text here",
  creator: "imagemeta",
  rights: "© 2026 Studio",
  credit: "Credit Line",
};

const td = new TextDecoder("latin1");
const contains = (b: Uint8Array, s: string) => td.decode(b).includes(s);

// ---- JPEG ----

test("detects JPEG", () => {
  assert.equal(detectFormat(fixture("sample.jpg")), "jpeg");
  assert.equal(detectFormat(fixture("tagged.jpg")), "jpeg");
});

test("reads XMP written by an independent tool (ImageMagick JPEG)", () => {
  const m = readMetadata(fixture("tagged.jpg"));
  assert.equal(m.description, "Independent JPEG/PNG fixture");
  assert.deepEqual(m.keywords, ["alpha", "beta"]);
  assert.equal(m.creator, "ImageMagick");
});

test("JPEG: plain reads empty, write round-trips, remove clears", () => {
  const s = fixture("sample.jpg");
  assert.deepEqual(readMetadata(s), {});
  const out = writeMetadata(s, META);
  assert.deepEqual(readMetadata(out), META);
  assert.deepEqual(readMetadata(removeMetadata(out)), {});
});

test("JPEG: still a JPEG, XMP placed in APP1, single copy after rewrite", () => {
  const out = writeMetadata(fixture("sample.jpg"), META);
  assert.equal(detectFormat(out), "jpeg");
  assert.ok(contains(out, "http://ns.adobe.com/xap/1.0/"));
  const twice = writeMetadata(out, { description: "replaced" });
  // Count the APP1 signature *with its trailing NUL* — the packet body also
  // contains the xmpRights namespace URI, which shares the "…1.0/" prefix.
  const sig = "http://ns.adobe.com/xap/1.0/" + String.fromCharCode(0);
  const occurrences = td.decode(twice).split(sig).length - 1;
  assert.equal(occurrences, 1, "exactly one XMP APP1 after rewrite");
  assert.deepEqual(readMetadata(twice), { description: "replaced" });
});

test("JPEG: entropy-coded image tail is preserved byte-for-byte", () => {
  const s = fixture("sample.jpg");
  const out = writeMetadata(s, META);
  // EOI + the last bytes of scan data must be intact at the end.
  assert.deepEqual(out.subarray(out.length - 32), s.subarray(s.length - 32));
});

test("JPEG: input not mutated", () => {
  const s = fixture("sample.jpg");
  const copy = s.slice();
  writeMetadata(s, META);
  assert.deepEqual(s, copy);
});

// ---- PNG ----

test("detects PNG", () => {
  assert.equal(detectFormat(fixture("sample.png")), "png");
  assert.equal(detectFormat(fixture("tagged.png")), "png");
});

test("PNG: plain reads empty, write round-trips, remove clears", () => {
  const s = fixture("sample.png");
  assert.deepEqual(readMetadata(s), {});
  const out = writeMetadata(s, META);
  assert.deepEqual(readMetadata(out), META);
  assert.deepEqual(readMetadata(removeMetadata(out)), {});
});

test("PNG: standard iTXt keyword, valid signature, single copy after rewrite", () => {
  const out = writeMetadata(fixture("sample.png"), META);
  assert.equal(detectFormat(out), "png");
  assert.ok(contains(out, "XML:com.adobe.xmp"));
  const twice = writeMetadata(out, { description: "replaced" });
  const occurrences = td.decode(twice).split("XML:com.adobe.xmp").length - 1;
  assert.equal(occurrences, 1, "exactly one XMP iTXt after rewrite");
  assert.deepEqual(readMetadata(twice), { description: "replaced" });
});

test("PNG: IDAT image data preserved and IEND remains last", () => {
  const s = fixture("sample.png");
  const out = writeMetadata(s, META);
  // The IDAT bytes from the source must appear verbatim in the output.
  const probe = s.subarray(s.length - 64, s.length - 16); // inside IEND-adjacent / IDAT tail
  let found = false;
  for (let i = 0; i + probe.length <= out.length && !found; i++) {
    let ok = true;
    for (let j = 0; j < probe.length; j++)
      if (out[i + j] !== probe[j]) {
        ok = false;
        break;
      }
    if (ok) found = true;
  }
  assert.ok(found, "original image bytes preserved");
  assert.ok(contains(out.subarray(out.length - 12), "IEND"), "IEND last");
});

test("PNG: CRC of the written iTXt chunk is valid", () => {
  // Re-read proves the chunk parses; a bad CRC wouldn't break our parser, so
  // recompute here independently to assert correctness.
  const out = writeMetadata(fixture("sample.png"), { description: "crc check" });
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++)
      c = table[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  let o = 8;
  while (o + 12 <= out.length) {
    const len = view.getUint32(o);
    const type = td.decode(out.subarray(o + 4, o + 8));
    if (type === "iTXt") {
      const stored = view.getUint32(o + 8 + len);
      const computed = crc(out.subarray(o + 4, o + 8 + len));
      assert.equal(stored, computed, "iTXt CRC must match");
    }
    o += 12 + len;
    if (type === "IEND") break;
  }
});
