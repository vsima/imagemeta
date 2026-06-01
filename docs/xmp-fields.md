# XMP field reference

The `ImageMetadata` object is a semantic façade. This is the exact mapping onto
XMP namespaces, and why each field matters for answer engines and search.

## Mapping

| `ImageMetadata` field | XMP property | Structure | Namespace URI |
| --- | --- | --- | --- |
| `description` | `dc:description` | `rdf:Alt` (x-default) | `http://purl.org/dc/elements/1.1/` |
| `title` | `dc:title` | `rdf:Alt` (x-default) | `http://purl.org/dc/elements/1.1/` |
| `keywords` | `dc:subject` | `rdf:Bag` | `http://purl.org/dc/elements/1.1/` |
| `creator` | `dc:creator` | `rdf:Seq` | `http://purl.org/dc/elements/1.1/` |
| `rights` | `dc:rights` | `rdf:Alt` (x-default) | `http://purl.org/dc/elements/1.1/` |
| `altText` | `Iptc4xmpCore:AltTextAccessibility` | `rdf:Alt` (x-default) | `http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/` |
| `credit` | `photoshop:Credit` | simple text | `http://ns.adobe.com/photoshop/1.0/` |
| `copyrightNotice` | `photoshop:Copyright` | simple text | `http://ns.adobe.com/photoshop/1.0/` |
| `licenseUrl` | `xmpRights:WebStatement` | simple URI | `http://ns.adobe.com/xap/1.0/rights/` |
| `licensor` | `plus:Licensor` (→ `plus:LicensorName` / `plus:LicensorURL`) | `rdf:Seq` of resources | `http://ns.useplus.org/ldf/xmp/1.0/` |

The last three are the fields Google Images reads for the **Licensable** feature:
`licenseUrl` + `licensor` (plus `creator`/`credit`/`copyrightNotice`) produce the
license badge and the "Get this image on…" link. See
[Image metadata in Google Images](https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata).

## Why these structures

XMP uses three RDF container types, and using the right one matters for
interoperability with Adobe tools, Google, and IPTC-aware software:

- **`rdf:Alt`** — language alternatives. Captions/titles use `xml:lang="x-default"`
  so a default is always available even without locale negotiation.
- **`rdf:Bag`** — an *unordered* set. Correct for keywords/tags.
- **`rdf:Seq`** — an *ordered* list. Correct for authors/creators (order is
  meaningful).

## Field notes for AEO

- **`description`** is the highest-value field: a natural-language sentence
  describing image content. This is what an LLM-backed engine quotes when it
  references the image.
- **`altText`** (`Iptc4xmpCore:AltTextAccessibility`) is the IPTC accessibility
  field that Google explicitly reads and may surface. Keep it concise and
  literal ("what is shown"), distinct from the marketing-flavored `description`
  if you like.
- **`keywords`** should be specific entities, not stuffing. Three to eight
  precise terms beat twenty vague ones.
- **`creator`/`credit`/`rights`** feed provenance and licensing signals, which
  increasingly factor into whether an engine will cite or display an image.

## Example packet

```xml
<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">
   <dc:description>
    <rdf:Alt><rdf:li xml:lang="x-default">Solar panels on a barn roof</rdf:li></rdf:Alt>
   </dc:description>
   <dc:subject>
    <rdf:Bag><rdf:li>solar</rdf:li><rdf:li>Vermont</rdf:li></rdf:Bag>
   </dc:subject>
   <Iptc4xmpCore:AltTextAccessibility>
    <rdf:Alt><rdf:li xml:lang="x-default">Black panels on a red barn roof</rdf:li></rdf:Alt>
   </Iptc4xmpCore:AltTextAccessibility>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
```

## Extending the model

To add a field (e.g. GPS, `xmpRights:WebStatement`):

1. Add it to `ImageMetadata` in `src/types.ts`.
2. Emit it in `serializeXmp` with the correct RDF container type.
3. Extract it in `parseXmp`.
4. Add a round-trip assertion in `test/xmp.test.ts`.

No format adapter changes are needed — the packet flows through every container
unchanged.
