# AEO guide: tagging images so answer engines understand them

**AEO** (Answer Engine Optimization) is making your content legible to
AI-powered search — ChatGPT, Perplexity, Google AI Overviews, Bing Copilot — in
addition to classic image search. For images, a large part of that is the
descriptive metadata embedded in the file itself.

## Why embedded metadata (not just HTML `alt`)

HTML `alt` attributes and surrounding page text help, but they live on the page,
not in the file. When an image is:

- served from a CDN or object store without its page context,
- ingested into a vector index or media library,
- downloaded, re-shared, or hot-linked,

…the embedded XMP travels **with the file**. It's the durable, portable
description of what the image is.

> **What's spec-backed vs. forward-looking.** [Google Images reads embedded IPTC
> metadata](https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata)
> (creator, credit, copyright, license) and **recommends embedding it**; see also
> [IPTC's guide](https://iptc.org/standards/photo-metadata/quick-guide-to-iptc-photo-metadata-and-google-images/).
> For image *ranking*, Google uses the [HTML `alt` attribute](https://developers.google.com/search/docs/appearance/google-images)
> and page context — embedded alt **complements** it (durability/accessibility),
> not replaces it. AI answer engines consuming embedded metadata is **plausible
> but not yet a documented spec** — treat that upside as a bet, not a guarantee.

## What to write

| Field | Goal | Good example |
| --- | --- | --- |
| `description` | One natural sentence: what is in the image | "A barista pouring latte art into a white ceramic cup" |
| `altText` | Literal accessibility description | "Hand pouring steamed milk into espresso, leaf pattern forming" |
| `keywords` | 3–8 precise entities | `["latte art", "espresso", "barista", "coffee shop"]` |
| `title` | Short label | "Latte Art Pour" |
| `creator` / `credit` | Provenance | "Jane Doe" / "Example Studio" |
| `rights` | Licensing | "© 2026 Example Studio" |

## Do / don't

**Do**
- Describe what's *actually visible*, concretely.
- Keep `description` and `altText` truthful — engines cross-check against the
  pixels and page.
- Use specific nouns and named entities in `keywords`.
- Tag at build/publish time so every served image carries metadata.

**Don't**
- Keyword-stuff. Twenty vague tags hurt more than help.
- Duplicate the same string into every field.
- Re-encode the image to add metadata (quality loss). This library never does —
  use it precisely to avoid that.

## Pipeline patterns

### At build time (static sites / SSG)

Tag images as part of your build so the deployed assets are AEO-ready:

```js
import { writeMetadata } from "aeo-image";
// for each image in /public, write description/keywords/altText from your CMS
```

See [`examples/02-aeo-batch.mjs`](../examples/02-aeo-batch.mjs).

### On upload (apps / CMS)

When a user or an AI captioner provides a description, embed it on upload before
storing to your bucket. Because the library has zero native dependencies, it runs
in the same serverless function that handles the upload — see
[`examples/04-cloud-function.mjs`](../examples/04-cloud-function.mjs).

### Auto-captioning

Pair this with a vision model: generate `description`/`altText`/`keywords` from
the image, then embed them. The model writes the words; this library writes the
bytes — losslessly.

## Verifying your tags

Any of these will read back what you wrote:

```bash
identify -verbose image.webp | grep -i xmp   # ImageMagick
exiftool image.webp                          # if installed
```

Or programmatically with `readMetadata(buf)`.
