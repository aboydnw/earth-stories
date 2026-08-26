import { describe, expect, it } from "vitest";
import {
  createDefaultSourceProvenance,
  projectSourceSchema,
  supportsChart,
  supportsTimeseriesChart,
} from "./project.js";

const provenance = createDefaultSourceProvenance();

function zarr(overrides: Record<string, unknown> = {}) {
  return projectSourceSchema.parse({
    id: "imerg",
    kind: "zarr",
    label: "IMERG",
    locator: "https://example.test/imerg.zarr",
    variable: "precipitation",
    delivery: "connected",
    provenance,
    ...overrides,
  });
}

const chartReadyZarr = {
  timeDimension: "time",
  timesteps: [{ label: "2020-01", index: 0 }],
  geozarr: {
    dimensions: ["lat", "lon"],
    transform: [0.1, 0, -180, 0, -0.1, 90],
    shape: [1800, 3600],
    crs: "EPSG:4326",
  },
};

describe("supportsTimeseriesChart", () => {
  it("accepts a Zarr carrying a time dimension, timesteps, and a transform", () => {
    expect(supportsTimeseriesChart(zarr(chartReadyZarr))).toBe(true);
  });

  it("rejects a Zarr connection that discovery has not filled in yet", () => {
    expect(supportsTimeseriesChart(zarr({ timeDimension: "time" }))).toBe(
      false,
    );
    expect(
      supportsTimeseriesChart(zarr({ ...chartReadyZarr, timesteps: [] })),
    ).toBe(false);
    expect(
      supportsTimeseriesChart(zarr({ ...chartReadyZarr, geozarr: null })),
    ).toBe(false);
  });
});

describe("supportsChart", () => {
  it("accepts CSV tables and rasters", () => {
    const csv = projectSourceSchema.parse({
      id: "table",
      kind: "csv",
      label: "Table",
      path: "data/table.csv",
      delivery: "included",
      provenance,
    });
    const cog = projectSourceSchema.parse({
      id: "dem",
      kind: "cog",
      label: "DEM",
      locator: "data/dem.tif",
      delivery: "included",
      provenance,
    });

    expect(supportsChart(csv)).toBe(true);
    expect(supportsChart(cog)).toBe(true);
  });

  it("rejects a source no chart series can read", () => {
    const image = projectSourceSchema.parse({
      id: "photo",
      kind: "image",
      label: "Photo",
      path: "data/photo.jpg",
      delivery: "included",
      provenance,
    });

    expect(supportsChart(image)).toBe(false);
    expect(supportsChart(zarr())).toBe(false);
  });
});
