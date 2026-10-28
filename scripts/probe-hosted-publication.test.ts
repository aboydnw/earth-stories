import { describe, expect, it } from "vitest";
import { probeHostedPublication } from "./probe-hosted-publication.js";

const base = "https://example.org/proof/";

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    ...init,
  });
}

function hostedFetch(options?: { cors?: boolean; range?: boolean }) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === `${base}publication.json`)
      return response({
        build: { id: "proof-build" },
        continuations: [
          {
            kind: "geolibre",
            projectHref: "explore/story.geolibre.json",
          },
        ],
      });
    if (url === `${base}explore/story.geolibre.json`)
      return response({
        metadata: { earthStories: { buildId: "proof-build" } },
        layers: [
          {
            id: "sites",
            source: { url: `${base}assets/sites.geojson` },
          },
          {
            id: "tiles",
            source: { url: `${base}assets/tiles.pmtiles` },
          },
          {
            id: "reference",
            source: { url: "https://tiles.example.org/{z}/{x}/{y}.png" },
          },
        ],
      });
    const headers = new Headers();
    if (url.includes("%7B")) return response("unresolved template");
    if (options?.cors !== false)
      headers.set("access-control-allow-origin", "*");
    if (url.endsWith("tiles.pmtiles") && init?.headers) {
      if (options?.range !== false) {
        headers.set("content-range", "bytes 0-31/256");
        return response("range", { status: 206, headers });
      }
    }
    return response("asset", { headers });
  };
}

describe("probeHostedPublication", () => {
  it("proves the manifest, companion, CORS, and byte-range contract", async () => {
    const evidence = await probeHostedPublication({
      publicationUrl: base,
      fetch: hostedFetch(),
      checkedAt: "2026-10-28T12:00:00.000Z",
    });

    expect(evidence).toEqual({
      version: 1,
      publicationUrl: base,
      checkedAt: "2026-10-28T12:00:00.000Z",
      checks: [
        { id: "manifest", status: "passed" },
        { id: "companion", status: "passed" },
        { id: "cors:sites", status: "passed" },
        { id: "cors:tiles", status: "passed" },
        { id: "range:tiles", status: "passed" },
        { id: "cors:reference", status: "passed" },
      ],
      failures: [],
    });
  });

  it("names hosting failures without leaking query strings", async () => {
    const evidence = await probeHostedPublication({
      publicationUrl: `${base}?token=secret`,
      fetch: hostedFetch({ cors: false, range: false }),
      checkedAt: "2026-10-28T12:00:00.000Z",
    });

    expect(evidence.publicationUrl).toBe(base);
    expect(evidence.failures).toEqual([
      "cors:sites: missing Access-Control-Allow-Origin",
      "cors:tiles: missing Access-Control-Allow-Origin",
      "range:tiles: expected HTTP 206 with Content-Range",
      "cors:reference: missing Access-Control-Allow-Origin",
    ]);
    expect(JSON.stringify(evidence)).not.toContain("secret");
  });
});
