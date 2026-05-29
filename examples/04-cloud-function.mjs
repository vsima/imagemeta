// Edge / serverless usage.
//
// Because the library has zero native dependencies and only uses Web-standard
// APIs (Uint8Array, TextEncoder), the SAME handler runs on Cloudflare Workers,
// Vercel/Netlify Edge, Deno Deploy, AWS Lambda, and Node servers — no binary,
// no filesystem, no cold-start codec.
//
// This file shows the handler shape using the Web Fetch API. Adapt the export
// to your platform's convention.
import { writeMetadata, detectFormat } from "../src/index.ts";

/**
 * POST an image body with ?description=...&keywords=a,b,c
 * Returns the same image with XMP metadata embedded (pixels untouched).
 */
export default async function handler(request) {
  const url = new URL(request.url);
  const input = new Uint8Array(await request.arrayBuffer());

  const format = detectFormat(input);
  if (format !== "webp") {
    return new Response(
      JSON.stringify({ error: `Unsupported format: ${format}` }),
      { status: 415, headers: { "content-type": "application/json" } },
    );
  }

  const keywords = url.searchParams.get("keywords");
  const output = writeMetadata(input, {
    description: url.searchParams.get("description") ?? undefined,
    altText: url.searchParams.get("alt") ?? undefined,
    keywords: keywords ? keywords.split(",").map((s) => s.trim()) : undefined,
  });

  return new Response(output, {
    headers: {
      "content-type": "image/webp",
      "content-length": String(output.length),
    },
  });
}

// --- Local smoke test (run directly: `node examples/04-cloud-function.mjs`) ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = fileURLToPath(new URL("../test/fixtures/simple.webp", import.meta.url));
  const body = readFileSync(path);
  const req = new Request(
    "https://example.com/tag?description=Edge%20test&keywords=a,b",
    { method: "POST", body },
  );
  const res = await handler(req);
  console.log("status:", res.status, "type:", res.headers.get("content-type"));
  console.log("bytes:", (await res.arrayBuffer()).byteLength);
}
