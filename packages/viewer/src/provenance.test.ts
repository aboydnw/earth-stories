import { describe, expect, it } from "vitest";
import type { PublicationAsset } from "@earth-stories/story-schema";
import {
  activeFilterDescriptions,
  safeHttpUrl,
  sourceFreshness,
} from "./provenance.js";

function asset(overrides: Partial<PublicationAsset> = {}): PublicationAsset {
  return {
    id: "source",
    label: "Source",
    kind: "cog",
    delivery: "connected",
    href: "https://example.org/data.tif",
    attribution: null,
    provenance: {
      publisher: null,
      sourceUrl: null,
      licenseName: null,
      licenseUrl: null,
      dataUpdatedAt: null,
      accessedAt: null,
      staleAfterDays: null,
      temporalCoverage: null,
      spatialCoverage: null,
      transformations: [],
    },
    sizeBytes: null,
    tileType: null,
    presentation: {
      opacity: 1,
      color: "#cf3f02",
      strokeColor: "#443f3f",
      radius: 6,
      sourceLayer: null,
      rasterBand: 2,
      rescale: [0, 100],
      colormap: "viridis",
      legendTitle: "",
      legendVisible: true,
      symbolProperty: null,
      categoryColors: {},
      filterProperty: "status",
      filterValue: "active",
    },
    zarr: null,
    trajectory: null,
    copc: null,
    ...overrides,
  };
}

describe("viewer provenance", () => {
  it("calculates freshness at the day boundary", () => {
    const item = asset({
      provenance: {
        ...asset().provenance,
        dataUpdatedAt: "2026-08-01",
        staleAfterDays: 7,
      },
    });
    expect(sourceFreshness(item, new Date("2026-08-08T23:59:59Z")).state).toBe(
      "current",
    );
    expect(sourceFreshness(item, new Date("2026-08-09T00:00:00Z")).state).toBe(
      "stale",
    );
    expect(sourceFreshness(asset()).state).toBe("unknown");
  });

  it("formats active raster and property filters", () => {
    expect(activeFilterDescriptions(asset())).toEqual([
      "status = active",
      "Raster band 2",
      "Display range 0–100",
    ]);
  });

  it("rejects unsafe reader links", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("https://reader:secret@example.org/data")).toBeNull();
    expect(safeHttpUrl("https://example.org/data")).toBe(
      "https://example.org/data",
    );
  });
});
