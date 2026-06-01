import type { ImageMetadata } from "../types.ts";

/**
 * Serialize a semantic metadata object into a standards-compliant XMP packet.
 *
 * XMP is just RDF/XML text wrapped in xpacket markers — no binary offsets, so
 * this is the safe, format-agnostic core. The same packet is spliced into any
 * container (WebP `XMP ` chunk, JPEG APP1, PNG iTXt, AVIF mime item).
 */

const XPACKET_BEGIN = '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>';
const XPACKET_END = '<?xpacket end="w"?>';

const NS = {
  dc: "http://purl.org/dc/elements/1.1/",
  xmpRights: "http://ns.adobe.com/xap/1.0/rights/",
  photoshop: "http://ns.adobe.com/photoshop/1.0/",
  Iptc4xmpCore: "http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/",
  plus: "http://ns.useplus.org/ldf/xmp/1.0/",
} as const;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A language-alternative property (dc:description, dc:title, dc:rights, alt text). */
function altLang(tag: string, value: string): string {
  return (
    `   <${tag}>\n` +
    `    <rdf:Alt>\n` +
    `     <rdf:li xml:lang="x-default">${esc(value)}</rdf:li>\n` +
    `    </rdf:Alt>\n` +
    `   </${tag}>\n`
  );
}

/** An unordered array property (dc:subject / keywords). */
function bag(tag: string, values: string[]): string {
  const items = values
    .map((v) => `      <rdf:li>${esc(v)}</rdf:li>\n`)
    .join("");
  return `   <${tag}>\n    <rdf:Bag>\n${items}    </rdf:Bag>\n   </${tag}>\n`;
}

/** An ordered array property (dc:creator). */
function seq(tag: string, values: string[]): string {
  const items = values
    .map((v) => `      <rdf:li>${esc(v)}</rdf:li>\n`)
    .join("");
  return `   <${tag}>\n    <rdf:Seq>\n${items}    </rdf:Seq>\n   </${tag}>\n`;
}

/**
 * The IPTC PLUS Licensor: a structured rdf:Seq of licensor entries, each a
 * resource with plus:LicensorName / plus:LicensorURL. Google reads LicensorURL
 * for the "Get this image on…" link.
 */
function licensorSeq(url: string, name?: string): string {
  const nameLine = name
    ? `       <plus:LicensorName>${esc(name)}</plus:LicensorName>\n`
    : "";
  return (
    `   <plus:Licensor>\n` +
    `    <rdf:Seq>\n` +
    `     <rdf:li rdf:parseType="Resource">\n` +
    nameLine +
    `       <plus:LicensorURL>${esc(url)}</plus:LicensorURL>\n` +
    `     </rdf:li>\n` +
    `    </rdf:Seq>\n` +
    `   </plus:Licensor>\n`
  );
}

export function serializeXmp(meta: ImageMetadata): string {
  const props: string[] = [];

  if (meta.description) props.push(altLang("dc:description", meta.description));
  if (meta.title) props.push(altLang("dc:title", meta.title));
  if (meta.keywords?.length) props.push(bag("dc:subject", meta.keywords));
  if (meta.creator) props.push(seq("dc:creator", [meta.creator]));
  if (meta.rights) props.push(altLang("dc:rights", meta.rights));
  if (meta.altText)
    props.push(altLang("Iptc4xmpCore:AltTextAccessibility", meta.altText));
  if (meta.credit)
    props.push(`   <photoshop:Credit>${esc(meta.credit)}</photoshop:Credit>\n`);
  if (meta.copyrightNotice)
    props.push(
      `   <photoshop:Copyright>${esc(meta.copyrightNotice)}</photoshop:Copyright>\n`,
    );
  if (meta.licenseUrl)
    props.push(
      `   <xmpRights:WebStatement>${esc(meta.licenseUrl)}</xmpRights:WebStatement>\n`,
    );
  if (meta.licensor?.url)
    props.push(licensorSeq(meta.licensor.url, meta.licensor.name));

  const xmlns = Object.entries(NS)
    .map(([prefix, uri]) => `    xmlns:${prefix}="${uri}"`)
    .join("\n");

  return (
    `${XPACKET_BEGIN}\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
    ` <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `  <rdf:Description rdf:about=""\n${xmlns}>\n` +
    props.join("") +
    `  </rdf:Description>\n` +
    ` </rdf:RDF>\n` +
    `</x:xmpmeta>\n` +
    `${XPACKET_END}`
  );
}
