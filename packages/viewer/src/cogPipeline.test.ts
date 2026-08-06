import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { GeoTIFF } from "@developmentseed/geotiff";
import {
  deriveCogRescale,
  selectSampleTiles,
  supportsInferredPipeline,
} from "./cogPipeline.js";
import { SampleFormat } from "@cogeotiff/core";

const FLOAT_COG = new URL(
  "../../../fixtures/float32-dem.cog.tif",
  import.meta.url,
).pathname;

class EmptyMetadataDocument {
  documentElement = {
    tagName: "GDALMetadata",
    querySelectorAll: () => [] as Element[],
  };
}

(globalThis as { DOMParser?: unknown }).DOMParser ??= class {
  parseFromString() {
    return new EmptyMetadataDocument();
  }
};

async function openFixture(): Promise<GeoTIFF> {
  const contents = await readFile(FLOAT_COG);
  return GeoTIFF.fromArrayBuffer(
    contents.buffer.slice(
      contents.byteOffset,
      contents.byteOffset + contents.byteLength,
    ),
  );
}

describe("cogPipeline", () => {
  it("routes float rasters away from the inferred pipeline", async () => {
    const geotiff = await openFixture();
    expect(geotiff.cachedTags.sampleFormat[0]).toBe(SampleFormat.Float);
    expect(supportsInferredPipeline(geotiff)).toBe(false);
  });

  it("derives a finite rescale range from the raster data", async () => {
    const geotiff = await openFixture();
    const [minimum, maximum] = await deriveCogRescale(geotiff, 1);
    expect(Number.isFinite(minimum)).toBe(true);
    expect(Number.isFinite(maximum)).toBe(true);
    expect(minimum).toBeLessThan(maximum);
  });

  it("samples tiles across the raster extent", () => {
    expect(selectSampleTiles(8, 2)).toEqual([
      [0, 0],
      [5, 0],
      [2, 1],
      [7, 1],
    ]);
  });
});
