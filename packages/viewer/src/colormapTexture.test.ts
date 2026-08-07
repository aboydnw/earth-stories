import { describe, expect, it, vi } from "vitest";
import { buildColormapLut, createColormapTexture } from "./colormapTexture.js";

describe("colormapTexture", () => {
  it("builds an opaque 256-color ramp with a transparent nodata slot", () => {
    const lut = buildColormapLut("viridis");
    expect(lut).toHaveLength(1024);
    expect(lut[3]).toBe(0);
    expect(lut[7]).toBe(255);
    expect(lut[1023]).toBe(255);
  });

  it("creates the 2d-array texture required by the raster colormap shader", () => {
    const createTexture = vi.fn(() => ({ id: "lut" }));
    const texture = createColormapTexture(
      { createTexture } as never,
      "terrain",
    );
    expect(texture).toEqual({ id: "lut" });
    expect(createTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        dimension: "2d-array",
        width: 256,
        height: 1,
        depth: 1,
        format: "rgba8unorm",
      }),
    );
  });
});
