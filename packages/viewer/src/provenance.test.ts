import { describe, expect, it } from "vitest";
import {
  activeFilterDescriptions,
  formatProvenanceDate,
  safeHttpUrl,
  sourceFreshness,
} from "./provenance.js";
import { publicationAsset as asset } from "./testFixtures.js";

describe("viewer provenance", () => {
  it("formats date-only provenance without shifting calendar days", () => {
    expect(formatProvenanceDate("2026-08-01")).toBe("Aug 1, 2026");
  });

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
