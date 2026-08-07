import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { GeoTIFF } from "@developmentseed/geotiff";
import {
  deriveCogRescale,
  selectSampleTiles,
  supportsInferredPipeline,
} from "./cogPipeline.js";
import { Photometric, SampleFormat } from "@cogeotiff/core";

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

  it("accepts supported imagery and rejects unsupported channel and bit layouts", () => {
    const raster = (
      samplesPerPixel: number,
      bitsPerSample: number[],
      sampleFormat = [SampleFormat.Uint],
    ) =>
      ({
        cachedTags: {
          samplesPerPixel,
          bitsPerSample,
          sampleFormat,
          photometric: Photometric.Rgb,
        },
      }) as unknown as GeoTIFF;

    expect(supportsInferredPipeline(raster(3, [8, 8, 8]))).toBe(true);
    expect(supportsInferredPipeline(raster(5, [8, 8, 8, 8, 8]))).toBe(false);
    expect(supportsInferredPipeline(raster(1, [4]))).toBe(false);
    expect(supportsInferredPipeline(raster(3, [32, 32, 32]))).toBe(false);
  });

  it("uses GDAL statistics before reading raster tiles", async () => {
    const fetchTile = vi.fn();
    const geotiff = {
      gdalMetadata: {
        bandStatistics: new Map([
          [1, { min: -12.5, max: 88.25, mean: null, stdDev: null }],
        ]),
      },
      overviews: [],
      fetchTile,
    } as unknown as GeoTIFF;

    await expect(deriveCogRescale(geotiff, 1)).resolves.toEqual([-12.5, 88.25]);
    expect(fetchTile).not.toHaveBeenCalled();
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
