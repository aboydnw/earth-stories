// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicationAsset } from "@earth-stories/story-schema";
import { VisualizationProvenance } from "./VisualizationProvenance.js";

afterEach(cleanup);

const asset = {
  id: "river",
  label: "River observations",
  kind: "geojson",
  delivery: "included",
  href: "assets/river.geojson",
  attribution: "Field team",
  provenance: {
    publisher: "River Observatory",
    sourceUrl: "https://example.org/river",
    licenseName: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    dataUpdatedAt: "2026-01-01",
    accessedAt: "2026-07-01",
    staleAfterDays: 30,
    temporalCoverage: { start: "2025-01-01", end: "2026-01-01" },
    spatialCoverage: "Lower river reach",
    transformations: ["Removed duplicates"],
  },
  sizeBytes: null,
  tileType: null,
  presentation: {
    opacity: 1,
    color: "#cf3f02",
    strokeColor: "#443f3f",
    radius: 6,
    sourceLayer: null,
    rasterBand: 1,
    rescale: null,
    colormap: "viridis",
    colormapReversed: false,
    legendTitle: "",
    legendVisible: true,
    symbolProperty: null,
    categoryColors: {},
    filterProperty: "status",
    filterValue: "active",
  },
  zarr: null,
  cog: null,
  trajectory: null,
  copc: null,
} satisfies PublicationAsset;

describe("VisualizationProvenance", () => {
  it("renders full, stale, and overlay provenance accessibly", () => {
    render(
      <VisualizationProvenance
        assets={[asset, { ...asset, id: "overlay", label: "Boundary overlay" }]}
        now={new Date("2026-08-08T00:00:00Z")}
      />,
    );
    expect(screen.getByText("May include stale data")).toBeTruthy();
    expect(screen.getAllByText("River Observatory")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Open source" })).toHaveLength(
      2,
    );
    expect(screen.getAllByText("status = active")).toHaveLength(2);
  });

  it("omits unsafe links while retaining meaningful missing fields", () => {
    render(
      <VisualizationProvenance
        assets={[
          {
            ...asset,
            attribution: null,
            provenance: {
              ...asset.provenance,
              publisher: null,
              sourceUrl: "javascript:alert(1)",
              licenseName: null,
              licenseUrl: null,
            },
          },
        ]}
        now={new Date("2026-08-08T00:00:00Z")}
      />,
    );
    expect(screen.queryByRole("link", { name: "Open source" })).toBeNull();
    expect(screen.getByText("Not provided")).toBeTruthy();
  });
});
