// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultSourceProvenance,
  type ProjectSource,
} from "@earth-stories/story-schema";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { SourceDetailsEditor } from "./SourceDetailsEditor";
import { DEFAULT_PRESENTATION } from "./SourcePresentationFields";

afterEach(cleanup);

describe("SourceDetailsEditor", () => {
  const legacyRegions: ProjectSource = {
    id: "regions",
    kind: "pmtiles",
    label: "States and provinces",
    locator:
      "https://pub-a8e1027739334149a1dadd24c89b6969.r2.dev/context/admin1.pmtiles",
    tileType: "vector",
    delivery: "connected",
    attribution: "Prior geoBoundaries attribution",
    sizeBytes: 123,
    provenance: {
      ...createDefaultSourceProvenance(),
      dataUpdatedAt: "2026-01-01",
      staleAfterDays: 30,
    },
    presentation: {
      ...DEFAULT_PRESENTATION,
      opacity: 0.45,
      sourceLayer: "admin1",
    },
  };

  it("offers a deliberate repair for the legacy connected regions archive", async () => {
    const change = vi.fn();
    render(
      <EarthStoriesProvider>
        <SourceDetailsEditor
          source={legacyRegions}
          chapterTitles={["Tracking a hurricane"]}
          onChange={change}
          onClose={() => undefined}
        />
      </EarthStoriesProvider>,
    );
    expect(change).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Switch to UNDP GeoHub" }),
    );
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith({
      ...legacyRegions,
      locator:
        "https://undpngddlsgeohubdev01.blob.core.windows.net/admin/cgaz/ADM1.pmtiles",
      sizeBytes: null,
      attribution: "geoBoundaries CGAZ, CC BY 4.0; hosted by UNDP GeoHub",
      provenance: {
        ...createDefaultSourceProvenance(),
        publisher: "UNDP GeoHub",
        sourceUrl:
          "https://dev.undpgeohub.org/data/bff5f75bf76fa5e75296c9c79cdf0755",
        licenseName: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        staleAfterDays: 30,
      },
      presentation: { ...legacyRegions.presentation!, sourceLayer: "admin" },
    });
  });

  it.each([
    { locator: "https://example.org/context/admin1.pmtiles" },
    { delivery: "included" as const },
    { tileType: "raster" as const },
  ])("does not offer to replace unrelated sources: %o", (override) => {
    render(
      <EarthStoriesProvider>
        <SourceDetailsEditor
          source={{ ...legacyRegions, ...override }}
          chapterTitles={[]}
          onChange={vi.fn()}
          onClose={() => undefined}
        />
      </EarthStoriesProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "Switch to UNDP GeoHub" }),
    ).toBeNull();
  });

  it("makes shared scope explicit before editing source identity", async () => {
    const change = vi.fn();
    const source = {
      id: "coast",
      kind: "local-geojson",
      label: "Coastline",
      path: "data/coast.geojson",
      delivery: "included",
      attribution: null,
      sizeBytes: 20,
      provenance: createDefaultSourceProvenance(),
    } as unknown as ProjectSource;
    render(
      <EarthStoriesProvider>
        <SourceDetailsEditor
          source={source}
          chapterTitles={["Opening map", "Coastal change"]}
          onChange={change}
          onClose={() => undefined}
        />
      </EarthStoriesProvider>,
    );
    expect(
      screen.getByText(/affects every chapter using this source/i),
    ).toBeTruthy();
    expect(screen.getByText(/Opening map/)).toBeTruthy();
    const label = screen.getByRole("textbox", { name: "Source label" });
    await userEvent.clear(label);
    await userEvent.type(label, "Updated coast");
    expect(change).toHaveBeenCalled();
  });
});
