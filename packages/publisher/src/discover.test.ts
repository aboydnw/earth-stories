import { describe, expect, it } from "vitest";
import { discoverRemoteSource } from "./discover.js";

describe("remote source discovery", () => {
  it("detects range-addressable PMTiles and reports size", async () => {
    const result = await discoverRemoteSource(
      "https://data.example/places.pmtiles",
      async () =>
        new Response(new Uint8Array([1]), {
          status: 206,
          headers: {
            "content-range": "bytes 0-16383/20480",
            "access-control-allow-origin": "*",
          },
        }),
    );
    expect(result).toMatchObject({
      kind: "pmtiles",
      sizeBytes: 20480,
      cors: true,
      byteRanges: true,
      issues: ["PMTiles metadata could not be read."],
      details: {},
    });
  });

  it("reports missing browser requirements", async () => {
    const result = await discoverRemoteSource(
      "https://data.example/image.tif",
      async () => new Response(new Uint8Array([1]), { status: 200 }),
    );
    expect(result.issues).toEqual([
      "Browser CORS access was not confirmed.",
      "Byte-range access was not confirmed.",
    ]);
    expect(result.details).toEqual({});
  });

  it("reports an unknown size when no size headers are available", async () => {
    const result = await discoverRemoteSource(
      "https://data.example/image.tif",
      async () =>
        new Response(null, {
          status: 206,
          headers: { "access-control-allow-origin": "*" },
        }),
    );
    expect(result.sizeBytes).toBeNull();
  });

  it("rejects oversized Zarr metadata", async () => {
    await expect(
      discoverRemoteSource("https://data.example/climate.zarr", async (url) =>
        String(url).endsWith(".zmetadata")
          ? new Response(new Uint8Array(8 * 1024 * 1024 + 1), { status: 200 })
          : new Response(null, {
              status: 200,
              headers: { "access-control-allow-origin": "*" },
            }),
      ),
    ).resolves.toMatchObject({
      issues: expect.arrayContaining(["Zarr metadata could not be read."]),
      details: {},
    });
  });

  it("discovers consolidated Zarr variables and dimensions", async () => {
    const result = await discoverRemoteSource(
      "https://data.example/climate.zarr",
      async (url) =>
        String(url).endsWith(".zmetadata")
          ? new Response(
              JSON.stringify({
                metadata: {
                  "temperature/.zarray": {
                    shape: [12, 180, 360],
                    dtype: "<f4",
                  },
                  "temperature/.zattrs": {
                    _ARRAY_DIMENSIONS: ["time", "lat", "lon"],
                  },
                },
              }),
              { status: 200 },
            )
          : new Response(new Uint8Array([1]), {
              status: 200,
              headers: { "access-control-allow-origin": "*" },
            }),
    );
    expect(result.details.variables).toEqual([
      {
        name: "temperature",
        dimensions: ["time", "lat", "lon"],
        shape: [12, 180, 360],
        dataType: "<f4",
      },
    ]);
  });
});
