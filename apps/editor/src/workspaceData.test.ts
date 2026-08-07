import { describe, expect, it } from "vitest";
import { connectedSource, uploadedSource } from "./workspaceData";

describe("workspace data sources", () => {
  it("builds a connected temporal Zarr source without creating a chapter", () => {
    const source = connectedSource(
      "https://data.example/precipitation.zarr",
      "zarr",
      {
        url: "https://data.example/precipitation.zarr",
        kind: "zarr",
        contentType: null,
        sizeBytes: null,
        cors: true,
        byteRanges: true,
        reachable: true,
        issues: [],
        details: {
          variables: [
            {
              name: "precipitation",
              dimensions: ["time", "latitude", "longitude"],
              shape: [2, 1800, 3600],
            },
          ],
        },
      },
    );

    expect(source).toMatchObject({
      kind: "zarr",
      variable: "precipitation",
      timeDimension: "time",
      timesteps: [{ label: "First available", index: 0 }],
    });
  });

  it("turns a local GeoTIFF upload into an included COG source", () => {
    expect(
      uploadedSource({ name: "imagery.tif" } as File, {
        path: "assets/imagery.tif",
        filename: "imagery.tif",
        sizeBytes: 42,
      }),
    ).toMatchObject({
      kind: "cog",
      locator: "assets/imagery.tif",
      delivery: "included",
    });
  });
});
