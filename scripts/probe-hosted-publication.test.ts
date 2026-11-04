import { describe, expect, it } from "vitest";
import { probeHostedPublication } from "./probe-hosted-publication.js";

const base = "https://example.org/proof/";

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    ...init,
  });
}

function hostedFetch(options?: {
  cors?: boolean;
  companionCors?: boolean;
  range?: boolean;
  assetStatus?: number;
}) {
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
      return response(
        {
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
        },
        {
          headers:
            options?.companionCors === false
              ? {}
              : { "access-control-allow-origin": "*" },
        },
      );
    const headers = new Headers();
    if (url.includes("%7B")) return response("unresolved template");
    if (options?.cors !== false)
      headers.set("access-control-allow-origin", "*");
    if (
      url.endsWith("tiles.pmtiles") &&
      new Headers(init?.headers).has("Range")
    ) {
      if (options?.range !== false) {
        headers.set("content-range", "bytes 0-31/256");
        return response("range", { status: 206, headers });
      }
    }
    return response("asset", { status: options?.assetStatus ?? 200, headers });
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
        { id: "cors:companion", status: "passed" },
        { id: "asset:sites", status: "passed" },
        { id: "cors:sites", status: "passed" },
        { id: "asset:tiles", status: "passed" },
        { id: "cors:tiles", status: "passed" },
        { id: "range:tiles", status: "passed" },
        { id: "range-cors:tiles", status: "passed" },
        { id: "asset:reference", status: "passed" },
        { id: "cors:reference", status: "passed" },
      ],
      failures: [],
    });
  });

  it.each([404, 500])(
    "rejects HTTP %s assets even when CORS is allowed",
    async (assetStatus) => {
      const evidence = await probeHostedPublication({
        publicationUrl: base,
        fetch: hostedFetch({ assetStatus }),
      });
      expect(evidence.failures).toEqual([
        `asset:sites: expected HTTP 200, received ${assetStatus}`,
        `asset:tiles: expected HTTP 200, received ${assetStatus}`,
        `asset:reference: expected HTTP 200, received ${assetStatus}`,
      ]);
    },
  );

  it("requires the companion to be readable from GeoLibre", async () => {
    const evidence = await probeHostedPublication({
      publicationUrl: base,
      fetch: hostedFetch({ companionCors: false }),
    });
    expect(evidence.failures).toEqual([
      "cors:companion: missing Access-Control-Allow-Origin",
    ]);
  });

  it("sends GeoLibre's origin for companion, asset, and range requests", async () => {
    const fetcher = hostedFetch();
    const calls: Array<{ url: string; headers: Headers }> = [];
    await probeHostedPublication({
      publicationUrl: base,
      fetch: async (input, init) => {
        calls.push({ url: String(input), headers: new Headers(init?.headers) });
        return fetcher(input, init);
      },
    });
    for (const call of calls.filter(
      ({ url }) => !url.endsWith("publication.json"),
    ))
      expect(call.headers.get("Origin")).toBe("https://web.geolibre.app");
    expect(
      calls.some(({ headers }) => headers.get("Range") === "bytes=0-31"),
    ).toBe(true);
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
      "range-cors:tiles: missing Access-Control-Allow-Origin",
      "cors:reference: missing Access-Control-Allow-Origin",
    ]);
    expect(JSON.stringify(evidence)).not.toContain("secret");
  });
});
