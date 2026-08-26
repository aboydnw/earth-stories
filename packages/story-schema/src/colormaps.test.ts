import { describe, expect, it } from "vitest";
import { COLORMAP_NAMES, colormapStops } from "./colormaps.js";

describe("colormapStops", () => {
  it("exposes the fourteen sandbox colormaps", () => {
    expect(COLORMAP_NAMES).toEqual([
      "viridis",
      "magma",
      "inferno",
      "plasma",
      "cividis",
      "coolwarm",
      "rdylgn",
      "rdbu",
      "ylorrd",
      "terrain",
      "blues",
      "reds",
      "greens",
      "grayscale",
    ]);
  });

  it("returns unit-range rgb stops and reverses on request", () => {
    const forward = colormapStops("viridis", false);
    expect(forward.length).toBeGreaterThanOrEqual(3);
    for (const stop of forward)
      for (const channel of stop) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    expect(colormapStops("viridis", true)).toEqual([...forward].reverse());
  });
});
