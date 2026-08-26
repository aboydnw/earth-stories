import { describe, expect, it } from "vitest";
import { buildColormapLut } from "./colormapTexture.js";

describe("buildColormapLut", () => {
  it("starts at the first stop and ends at the last stop", () => {
    const lut = buildColormapLut("blues", false);
    expect([lut[0], lut[1], lut[2]]).toEqual([247, 251, 255]);
    expect([lut[255 * 4], lut[255 * 4 + 1], lut[255 * 4 + 2]]).toEqual([
      8, 48, 107,
    ]);
  });

  it("reverses the ramp", () => {
    const lut = buildColormapLut("blues", true);
    expect([lut[255 * 4], lut[255 * 4 + 1], lut[255 * 4 + 2]]).toEqual([
      247, 251, 255,
    ]);
  });
});
