import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  serializeXmp,
  parseXmp,
  writeMetadata,
  readMetadata,
} from "../src/index.ts";

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))),
  );

const LICENSE = {
  description: "A licensable stock photo of a barn",
  creator: "Jane Doe",
  credit: "Example Studio",
  rights: "© 2026 Example Studio. All rights reserved.",
  copyrightNotice: "© 2026 Example Studio",
  licenseUrl: "https://example.com/license/barn-123",
  licensor: { url: "https://example.com/buy/barn-123", name: "Example Stock" },
};

test("serialize→parse round-trips all licensing fields", () => {
  assert.deepEqual(parseXmp(serializeXmp(LICENSE)), LICENSE);
});

test("emits the documented Google Licensable fields", () => {
  const xmp = serializeXmp(LICENSE);
  assert.match(xmp, /xmlns:plus="http:\/\/ns\.useplus\.org\/ldf\/xmp\/1\.0\/"/);
  assert.match(xmp, /<xmpRights:WebStatement>https:\/\/example\.com\/license\/barn-123<\/xmpRights:WebStatement>/);
  assert.match(xmp, /<plus:LicensorURL>https:\/\/example\.com\/buy\/barn-123<\/plus:LicensorURL>/);
  assert.match(xmp, /<plus:LicensorName>Example Stock<\/plus:LicensorName>/);
  assert.match(xmp, /<photoshop:Copyright>/);
});

test("licensor works without a name", () => {
  const meta = { licensor: { url: "https://example.com/buy" } };
  const out = parseXmp(serializeXmp(meta));
  assert.deepEqual(out.licensor, { url: "https://example.com/buy" });
});

test("licensing fields survive a real WebP write/read round-trip", () => {
  const out = writeMetadata(fixture("simple.webp"), LICENSE);
  assert.deepEqual(readMetadata(out), LICENSE);
});

test("licensing fields survive a real AVIF write/read round-trip", () => {
  const out = writeMetadata(fixture("sample.avif"), LICENSE);
  assert.deepEqual(readMetadata(out), LICENSE);
});

test("URLs with query/ampersands are escaped and round-trip", () => {
  const meta = {
    licenseUrl: "https://ex.com/l?id=1&tier=pro",
    licensor: { url: "https://ex.com/buy?id=1&ref=g" },
  };
  const out = parseXmp(serializeXmp(meta));
  assert.equal(out.licenseUrl, "https://ex.com/l?id=1&tier=pro");
  assert.equal(out.licensor?.url, "https://ex.com/buy?id=1&ref=g");
});

test("no licensing fields → none emitted (backward compatible)", () => {
  const xmp = serializeXmp({ description: "plain" });
  assert.ok(!/plus:Licensor/.test(xmp));
  assert.ok(!/WebStatement/.test(xmp));
  assert.ok(!/photoshop:Copyright/.test(xmp));
  assert.deepEqual(parseXmp(xmp), { description: "plain" });
});
