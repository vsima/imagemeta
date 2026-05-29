import type { ImageMetadata } from "../types.ts";

/**
 * Pragmatic XMP extractor.
 *
 * This is intentionally NOT a full RDF/XML parser (which would mean a
 * dependency). It pulls the semantic fields we care about out of the packet
 * with targeted matching, and round-trips losslessly with `serializeXmp`.
 * Unknown/extra properties are ignored on read, never corrupted on write.
 */

function unesc(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/** First <rdf:li> text inside the named property (handles Alt/Seq wrappers). */
function firstLi(xmp: string, tag: string): string | undefined {
  const block = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(
    xmp,
  );
  if (!block) return undefined;
  const li = /<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/i.exec(block[1] ?? "");
  if (li) return unesc(li[1] ?? "");
  // Simple property with no Alt/Bag/Seq wrapper.
  const inner = (block[1] ?? "").trim();
  return inner && !inner.startsWith("<") ? unesc(inner) : undefined;
}

/** All <rdf:li> texts inside the named property (Bag/Seq). */
function allLi(xmp: string, tag: string): string[] | undefined {
  const block = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(
    xmp,
  );
  if (!block) return undefined;
  const items: string[] = [];
  const re = /<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block[1] ?? "")) !== null) items.push(unesc(m[1] ?? ""));
  return items.length ? items : undefined;
}

/** Simple element value, e.g. <photoshop:Credit>X</photoshop:Credit>. */
function simple(xmp: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xmp);
  return m ? unesc(m[1] ?? "") : undefined;
}

export function parseXmp(xmp: string): ImageMetadata {
  const meta: ImageMetadata = {};

  const description = firstLi(xmp, "dc:description");
  if (description) meta.description = description;

  const title = firstLi(xmp, "dc:title");
  if (title) meta.title = title;

  const keywords = allLi(xmp, "dc:subject");
  if (keywords) meta.keywords = keywords;

  const creator = firstLi(xmp, "dc:creator");
  if (creator) meta.creator = creator;

  const rights = firstLi(xmp, "dc:rights");
  if (rights) meta.rights = rights;

  const altText = firstLi(xmp, "Iptc4xmpCore:AltTextAccessibility");
  if (altText) meta.altText = altText;

  const credit = simple(xmp, "photoshop:Credit");
  if (credit) meta.credit = credit;

  return meta;
}
