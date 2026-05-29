import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeXmp, parseXmp } from "../src/index.ts";

test("serialize → parse round-trips every field", () => {
  const meta = {
    description: "Caption",
    title: "Title",
    keywords: ["a", "b", "c"],
    creator: "Jane Doe",
    rights: "© 2026 Jane",
    altText: "Alt text",
    credit: "Studio",
  };
  assert.deepEqual(parseXmp(serializeXmp(meta)), meta);
});

test("emits a valid, self-describing xpacket", () => {
  const xmp = serializeXmp({ description: "x" });
  assert.match(xmp, /^<\?xpacket begin=/);
  assert.match(xmp, /<\?xpacket end="w"\?>$/);
  assert.match(xmp, /xmlns:dc="http:\/\/purl\.org\/dc\/elements\/1\.1\/"/);
});

test("escapes XML metacharacters and round-trips them", () => {
  const meta = { description: 'A & B < C > D "quoted"' };
  const xmp = serializeXmp(meta);
  assert.ok(!/<C>/.test(xmp), "raw < must be escaped");
  assert.match(xmp, /&amp;/);
  assert.equal(parseXmp(xmp).description, 'A & B < C > D "quoted"');
});

test("omits absent fields entirely", () => {
  const xmp = serializeXmp({ description: "only this" });
  assert.ok(!/dc:subject/.test(xmp));
  assert.ok(!/dc:creator/.test(xmp));
  assert.deepEqual(parseXmp(xmp), { description: "only this" });
});

test("empty metadata produces a valid empty packet", () => {
  const xmp = serializeXmp({});
  assert.match(xmp, /xpacket begin/);
  assert.deepEqual(parseXmp(xmp), {});
});

test("parses third-party XMP it did not author", () => {
  // Minimal foreign packet: attribute-style + different whitespace.
  const foreign = `<?xpacket begin="" id="x"?><x:xmpmeta xmlns:x="adobe:ns:meta/">
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:subject><rdf:Bag><rdf:li>foo</rdf:li><rdf:li>bar</rdf:li></rdf:Bag></dc:subject>
      </rdf:Description>
    </rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  assert.deepEqual(parseXmp(foreign).keywords, ["foo", "bar"]);
});
