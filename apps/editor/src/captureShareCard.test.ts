// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { coverRect, mapAttribution, wrapLines } from "./captureShareCard";

const measure = (value: string) => value.length * 10;

describe("coverRect", () => {
  it("crops the sides of a capture wider than the card", () => {
    const rect = coverRect(2000, 627);
    expect(rect.sHeight).toBe(627);
    expect(rect.sWidth).toBeCloseTo(1200);
    expect(rect.sx).toBeCloseTo(400);
    expect(rect.sy).toBe(0);
  });

  it("crops the top and bottom of a capture taller than the card", () => {
    const rect = coverRect(1200, 1200);
    expect(rect.sWidth).toBe(1200);
    expect(rect.sHeight).toBeCloseTo(627);
    expect(rect.sy).toBeCloseTo(286.5);
    expect(rect.sx).toBe(0);
  });

  it("leaves a capture already at the card ratio uncropped", () => {
    const rect = coverRect(1200, 627);
    expect(rect).toEqual({ sx: 0, sy: 0, sWidth: 1200, sHeight: 627 });
  });
});

describe("wrapLines", () => {
  it("keeps a short title on one line", () => {
    expect(wrapLines("Coastal erosion", measure, 400)).toEqual([
      "Coastal erosion",
    ]);
  });

  it("breaks a long title on word boundaries", () => {
    const lines = wrapLines("A decade of coastal change", measure, 120);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("A decade of coastal change");
  });

  it("ellipsizes a title that exceeds the line budget", () => {
    const lines = wrapLines(`${"word ".repeat(40)}`, measure, 100, 2);
    expect(lines).toHaveLength(2);
    expect(lines.at(-1)!.endsWith("…")).toBe(true);
  });

  it("ellipsizes a single word too wide for the card", () => {
    const lines = wrapLines("x".repeat(40), measure, 100);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.endsWith("…")).toBe(true);
    expect(measure(lines[0]!)).toBeLessThanOrEqual(100);
  });

  it("returns nothing for blank text", () => {
    expect(wrapLines("   ", measure, 400)).toEqual([]);
  });
});

describe("mapAttribution", () => {
  it("combines authored data and basemap credits without duplicates", () => {
    const map = document.createElement("div");
    map.innerHTML = `
      <span class="story-map__attribution">Coastal Observatory</span>
      <span class="maplibregl-ctrl-attrib">© OpenStreetMap contributors</span>
      <span class="story-map__attribution">Coastal Observatory</span>
    `;
    expect(mapAttribution(map)).toBe(
      "Coastal Observatory · © OpenStreetMap contributors",
    );
  });
});
