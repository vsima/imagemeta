import type { ImageMetadata } from "../types.ts";
import { parseXmp } from "../xmp/parse.ts";
import { serializeXmp } from "../xmp/serialize.ts";
import {
  type Box,
  parseBoxes,
  childBoxes,
  find,
  fourccAt,
  dv,
  readUintBE,
  readCString,
} from "./isobmff.ts";

/**
 * AVIF / HEIC metadata reader.
 *
 * XMP in AVIF is an *item*: an `infe` entry in `iinf` declares an item of type
 * `mime` with content-type `application/rdf+xml`, and the `iloc` box says where
 * its bytes live (an extent in `mdat`, or in an `idat` box). We walk the box
 * tree, find that item, follow its location, and decode the XMP packet.
 *
 * HEIC uses the identical container, so this reader handles both.
 */

const UTF8 = new TextDecoder("utf-8");
const ENC = new TextEncoder();
const XMP_CONTENT_TYPE = "application/rdf+xml";
const EXIF_ITEM_TYPE = "Exif";

interface ItemInfo {
  id: number;
  type: string;
  contentType?: string;
}

interface Extent {
  offset: number;
  length: number;
}

interface ItemLocation {
  id: number;
  constructionMethod: number; // 0 = file, 1 = idat, 2 = item
  baseOffset: number;
  extents: Extent[];
}

export function isAvif(b: Uint8Array): boolean {
  if (b.length < 12 || fourccAt(b, 4) !== "ftyp") return false;
  const size = dv(b).getUint32(0);
  const ftypEnd = size > 8 && size <= b.length ? size : b.length;
  // Major brand at 8, then 4-byte compatible brands from 16 onward.
  for (let o = 8; o + 4 <= ftypEnd; o += o === 8 ? 8 : 4) {
    if (/^(avif|avis|heic|heix|hevc|mif1|msf1)$/.test(fourccAt(b, o))) return true;
  }
  return false;
}

/** Parse an `infe` box into item id / type / (optional) content-type. */
function parseInfe(b: Uint8Array, box: Box): ItemInfo {
  const end = box.start + box.size;
  let o = box.start + box.headerSize;
  const version = b[o]!;
  o += 4; // version (1) + flags (3)

  let id: number;
  if (version >= 3) {
    id = readUintBE(b, o, 4);
    o += 4;
  } else {
    id = readUintBE(b, o, 2);
    o += 2;
  }
  o += 2; // item_protection_index

  if (version >= 2) {
    const type = fourccAt(b, o);
    o += 4;
    const name = readCString(b, o, end); // item_name (ignored)
    o = name.next;
    let contentType: string | undefined;
    if (type === "mime") contentType = readCString(b, o, end).str;
    return { id, type, contentType };
  }
  // Versions 0/1 use item_name only; not used for AVIF metadata items.
  return { id, type: "" };
}

/** Parse `iinf` into the list of items. */
function parseItemInfos(b: Uint8Array, meta: Box): ItemInfo[] {
  const iinf = find(childBoxes(b, meta, true), "iinf");
  if (!iinf) return [];
  const version = b[iinf.start + iinf.headerSize]!;
  const countBytes = version === 0 ? 2 : 4;
  const listStart = iinf.start + iinf.headerSize + 4 + countBytes;
  return parseBoxes(b, listStart, iinf.start + iinf.size)
    .filter((x) => x.type === "infe")
    .map((x) => parseInfe(b, x));
}

/** Parse `iloc` into per-item locations. */
function parseItemLocations(b: Uint8Array, meta: Box): ItemLocation[] {
  const iloc = find(childBoxes(b, meta, true), "iloc");
  if (!iloc) return [];
  let o = iloc.start + iloc.headerSize;
  const version = b[o]!;
  o += 4; // version + flags

  const offsetSize = b[o]! >> 4;
  const lengthSize = b[o]! & 0x0f;
  o += 1;
  const baseOffsetSize = b[o]! >> 4;
  const indexSize = version === 1 || version === 2 ? b[o]! & 0x0f : 0;
  o += 1;

  const itemCount = version < 2 ? readUintBE(b, o, 2) : readUintBE(b, o, 4);
  o += version < 2 ? 2 : 4;

  const locations: ItemLocation[] = [];
  for (let i = 0; i < itemCount; i++) {
    const id = version < 2 ? readUintBE(b, o, 2) : readUintBE(b, o, 4);
    o += version < 2 ? 2 : 4;

    let constructionMethod = 0;
    if (version === 1 || version === 2) {
      constructionMethod = readUintBE(b, o, 2) & 0x0f;
      o += 2;
    }
    o += 2; // data_reference_index

    const baseOffset = readUintBE(b, o, baseOffsetSize);
    o += baseOffsetSize;

    const extentCount = readUintBE(b, o, 2);
    o += 2;

    const extents: Extent[] = [];
    for (let e = 0; e < extentCount; e++) {
      if (indexSize > 0) o += indexSize; // extent_index (unused)
      const offset = readUintBE(b, o, offsetSize);
      o += offsetSize;
      const length = readUintBE(b, o, lengthSize);
      o += lengthSize;
      extents.push({ offset, length });
    }
    locations.push({ id, constructionMethod, baseOffset, extents });
  }
  return locations;
}

/** Read an item's raw bytes following its location (file or idat). */
function readItemData(
  b: Uint8Array,
  loc: ItemLocation,
  meta: Box,
): Uint8Array | null {
  let base = loc.baseOffset;
  if (loc.constructionMethod === 1) {
    const idat = find(childBoxes(b, meta, true), "idat");
    if (!idat) return null;
    base += idat.start + idat.headerSize;
  } else if (loc.constructionMethod === 2) {
    return null; // item-relative construction not supported
  }
  const parts: Uint8Array[] = [];
  for (const ext of loc.extents) {
    const start = base + ext.offset;
    if (start + ext.length > b.length) return null;
    parts.push(b.subarray(start, start + ext.length));
  }
  if (parts.length === 1) return parts[0]!;
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function readAvifMetadata(b: Uint8Array): ImageMetadata {
  const meta = find(parseBoxes(b, 0, b.length), "meta");
  if (!meta) return {};

  const items = parseItemInfos(b, meta);
  const xmpItem = items.find(
    (it) => it.type === "mime" && it.contentType === XMP_CONTENT_TYPE,
  );
  if (!xmpItem) return {};

  const loc = parseItemLocations(b, meta).find((l) => l.id === xmpItem.id);
  if (!loc) return {};

  const data = readItemData(b, loc, meta);
  if (!data) return {};
  return parseXmp(UTF8.decode(data));
}

// ---------------------------------------------------------------------------
// Writing — full rebuild with from-scratch offset computation.
//
// AVIF's `iloc` stores absolute file offsets into `mdat`. Inserting metadata
// shifts `mdat`, which would invalidate every existing offset. Rather than
// patch offsets by a delta, we read every item's bytes, emit a fresh `meta`
// (regenerated iinf/iloc/iref) and a fresh `mdat`, and compute all offsets
// from the new layout. iloc is rewritten as version 0 (absolute file offsets,
// 4-byte fields), so there is no construction-method ambiguity in the output.
// ---------------------------------------------------------------------------

function u16(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}
function u32(n: number): Uint8Array {
  const a = new Uint8Array(4);
  new DataView(a.buffer).setUint32(0, n >>> 0);
  return a;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
function emitBox(type: string, payload: Uint8Array): Uint8Array {
  const size = 8 + payload.length;
  if (size > 0xffffffff) throw new Error(`AVIF: box "${type}" exceeds 32-bit size`);
  return concat([u32(size), ENC.encode(type), payload]);
}

function parsePrimaryItemId(b: Uint8Array, meta: Box): number {
  const pitm = find(childBoxes(b, meta, true), "pitm");
  if (!pitm) return 0;
  const o = pitm.start + pitm.headerSize;
  const version = b[o]!;
  return version === 0 ? readUintBE(b, o + 4, 2) : readUintBE(b, o + 4, 4);
}

function buildXmpInfe(id: number): Uint8Array {
  return emitBox(
    "infe",
    concat([
      new Uint8Array([2, 0, 0, 0]), // version 2, flags 0
      u16(id),
      u16(0), // item_protection_index
      ENC.encode("mime"), // item_type
      new Uint8Array([0]), // item_name (empty)
      ENC.encode(XMP_CONTENT_TYPE),
      new Uint8Array([0]), // content_type NUL terminator
    ]),
  );
}

function buildIinf(infeBoxes: Uint8Array[]): Uint8Array {
  if (infeBoxes.length > 0xffff)
    throw new Error("AVIF: too many items for iinf v0");
  return emitBox(
    "iinf",
    concat([new Uint8Array([0, 0, 0, 0]), u16(infeBoxes.length), ...infeBoxes]),
  );
}

interface ItemLayout {
  id: number;
  offset: number;
  length: number;
}

function buildIloc(items: ItemLayout[]): Uint8Array {
  const parts: Uint8Array[] = [
    new Uint8Array([0, 0, 0, 0]), // version 0 + flags
    new Uint8Array([(4 << 4) | 4]), // offset_size=4, length_size=4
    new Uint8Array([0]), // base_offset_size=0, reserved
    u16(items.length),
  ];
  for (const it of items) {
    if (it.id > 0xffff) throw new Error("AVIF: item id overflow for iloc v0");
    parts.push(
      u16(it.id),
      u16(0), // data_reference_index
      u16(1), // extent_count
      u32(it.offset),
      u32(it.length),
    );
  }
  return emitBox("iloc", concat(parts));
}

function buildCdsc(fromId: number, toId: number, version: number): Uint8Array {
  const idb = version === 0 ? u16 : u32;
  return emitBox("cdsc", concat([idb(fromId), u16(1), idb(toId)]));
}

function buildIref(
  fromId: number,
  toId: number,
  existing: { childrenBytes: Uint8Array; version: number } | null,
): Uint8Array {
  const version = existing ? existing.version : 0;
  return emitBox(
    "iref",
    concat([
      new Uint8Array([version, 0, 0, 0]),
      existing ? existing.childrenBytes : new Uint8Array(0),
      buildCdsc(fromId, toId, version),
    ]),
  );
}

/** Raw `infe` box bytes inside an `iinf`, preserved verbatim. */
function rawInfeBoxes(b: Uint8Array, meta: Box): Uint8Array[] {
  const iinf = find(childBoxes(b, meta, true), "iinf");
  if (!iinf) return [];
  const version = b[iinf.start + iinf.headerSize]!;
  const listStart = iinf.start + iinf.headerSize + 4 + (version === 0 ? 2 : 4);
  return parseBoxes(b, listStart, iinf.start + iinf.size)
    .filter((x) => x.type === "infe")
    .map((x) => b.slice(x.start, x.start + x.size));
}

/**
 * Core rebuild. `xmpPacket` non-null adds/replaces the XMP item; null removes
 * all metadata items (XMP + EXIF). Image data and all other items are
 * preserved byte-for-byte at recomputed offsets.
 */
function rebuild(b: Uint8Array, xmpPacket: Uint8Array | null): Uint8Array {
  const top = parseBoxes(b, 0, b.length);
  const meta = find(top, "meta");
  if (!meta) throw new Error("AVIF: no meta box; cannot write metadata");

  const metaChildren = childBoxes(b, meta, true);
  const items = parseItemInfos(b, meta);
  const locations = parseItemLocations(b, meta);
  const primaryId = parsePrimaryItemId(b, meta);

  const isMetaItem = (it: ItemInfo) =>
    (it.type === "mime" && it.contentType === XMP_CONTENT_TYPE) ||
    it.type === EXIF_ITEM_TYPE;

  // Read every item's bytes so we can relocate them into a fresh mdat.
  const dataById = new Map<number, Uint8Array>();
  for (const loc of locations) {
    const d = readItemData(b, loc, meta);
    if (!d)
      throw new Error(
        `AVIF: item ${loc.id} uses an unsupported construction method; refusing to rewrite`,
      );
    dataById.set(loc.id, d);
  }

  const existingXmp = items.find(
    (it) => it.type === "mime" && it.contentType === XMP_CONTENT_TYPE,
  );

  // Decide which items survive, and the new infe list.
  let infeBoxes = rawInfeBoxes(b, meta);
  let xmpId = existingXmp?.id ?? 0;
  let addCdsc = false;

  if (xmpPacket) {
    if (existingXmp) {
      dataById.set(xmpId, xmpPacket); // replace contents in place
    } else {
      xmpId = Math.max(0, ...items.map((i) => i.id), ...locations.map((l) => l.id)) + 1;
      if (xmpId > 0xffff) throw new Error("AVIF: item id space exhausted");
      dataById.set(xmpId, xmpPacket);
      infeBoxes.push(buildXmpInfe(xmpId));
      addCdsc = true;
    }
  } else {
    // Remove path: drop metadata items entirely.
    const metaIds = new Set(items.filter(isMetaItem).map((i) => i.id));
    for (const id of metaIds) dataById.delete(id);
    const removedTypes = items.filter(isMetaItem);
    infeBoxes = filterInfeBoxes(b, meta, removedTypes);
  }

  // Ordered surviving item ids → mdat layout order.
  const order = locations.map((l) => l.id).filter((id) => dataById.has(id));
  if (xmpPacket && !existingXmp) order.push(xmpId);

  const newIinf = buildIinf(infeBoxes);

  // iref handling.
  const existingIref = find(metaChildren, "iref");
  let newIref: Uint8Array | null = null;
  if (xmpPacket) {
    if (existingXmp && existingIref) {
      newIref = b.slice(existingIref.start, existingIref.start + existingIref.size);
    } else {
      const existing = existingIref
        ? {
            version: b[existingIref.start + existingIref.headerSize]!,
            childrenBytes: b.slice(
              existingIref.start + existingIref.headerSize + 4,
              existingIref.start + existingIref.size,
            ),
          }
        : null;
      newIref = buildIref(xmpId, primaryId || order[0]!, existing);
      void addCdsc;
    }
  } else if (existingIref) {
    // On remove, drop references that point from removed items (simplest: drop iref if it only described metadata; otherwise keep verbatim).
    newIref = b.slice(existingIref.start, existingIref.start + existingIref.size);
  }

  // Assemble meta with a given iloc; same field widths → constant length.
  const buildMeta = (layout: ItemLayout[]): Uint8Array => {
    const newIloc = buildIloc(layout);
    const parts: Uint8Array[] = [];
    let irefDone = false;
    for (const c of metaChildren) {
      if (c.type === "iinf") parts.push(newIinf);
      else if (c.type === "iloc") parts.push(newIloc);
      else if (c.type === "iref") {
        if (newIref) parts.push(newIref);
        irefDone = true;
      } else parts.push(b.slice(c.start, c.start + c.size));
    }
    if (!irefDone && newIref) parts.push(newIref);
    return emitBox("meta", concat([new Uint8Array(4), ...parts]));
  };

  // Pass 1: placeholder offsets to measure meta length.
  const placeholder: ItemLayout[] = order.map((id) => ({
    id,
    offset: 0,
    length: dataById.get(id)!.length,
  }));
  const metaProbe = buildMeta(placeholder);

  // Top-level output: keep everything except old mdat/idat/free; meta replaced.
  const keptTop = top.filter(
    (x) => !["mdat", "idat", "free", "skip"].includes(x.type),
  );
  let prefix = 0;
  for (const x of keptTop) prefix += x.type === "meta" ? metaProbe.length : x.size;
  const mdatDataStart = prefix + 8; // + mdat header

  // Pass 2: real offsets.
  let running = 0;
  const layout: ItemLayout[] = order.map((id) => {
    const length = dataById.get(id)!.length;
    const o = mdatDataStart + running;
    running += length;
    return { id, offset: o, length };
  });
  if (mdatDataStart + running > 0xffffffff)
    throw new Error("AVIF: file too large for 32-bit offsets");

  const metaBytes = buildMeta(layout);
  if (metaBytes.length !== metaProbe.length)
    throw new Error("AVIF: meta length drifted between passes (internal error)");

  const mdat = emitBox("mdat", concat(order.map((id) => dataById.get(id)!)));

  const outParts: Uint8Array[] = [];
  for (const x of keptTop)
    outParts.push(
      x.type === "meta" ? metaBytes : b.slice(x.start, x.start + x.size),
    );
  outParts.push(mdat);
  return concat(outParts);
}

/** Drop the `infe` boxes belonging to removed items, by matching their ids. */
function filterInfeBoxes(
  b: Uint8Array,
  meta: Box,
  removed: ItemInfo[],
): Uint8Array[] {
  const removedIds = new Set(removed.map((r) => r.id));
  const iinf = find(childBoxes(b, meta, true), "iinf");
  if (!iinf) return [];
  const version = b[iinf.start + iinf.headerSize]!;
  const listStart = iinf.start + iinf.headerSize + 4 + (version === 0 ? 2 : 4);
  return parseBoxes(b, listStart, iinf.start + iinf.size)
    .filter((x) => x.type === "infe")
    .filter((x) => !removedIds.has(parseInfe(b, x).id))
    .map((x) => b.slice(x.start, x.start + x.size));
}

export function writeAvifMetadata(
  b: Uint8Array,
  meta: ImageMetadata,
): Uint8Array {
  return rebuild(b, ENC.encode(serializeXmp(meta)));
}

export function removeAvifMetadata(b: Uint8Array): Uint8Array {
  return rebuild(b, null);
}
