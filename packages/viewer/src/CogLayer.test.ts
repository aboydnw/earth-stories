import { describe, expect, it } from "vitest";
import { colorize } from "./CogLayer.js";

describe("colorize", () => {
  it("emits float literals for integer rescale and category values", () => {
    const module = colorize("terrain", false, { "0": "#ffffff" }, [0, 1]);
    const shader = module.inject["fs:DECKGL_FILTER_COLOR"];

    expect(shader).toContain("float rawValue = 0.0 + value * 1.0;");
    expect(shader).toContain("rawValue - 0.0");
    expect(shader).toContain("vec3(1.0,1.0,1.0)");
  });

  it("reverses the ramp so the first mix starts from the final stop", () => {
    const forward = colorize("blues", false, {}, [0, 1]).inject[
      "fs:DECKGL_FILTER_COLOR"
    ];
    const reversed = colorize("blues", true, {}, [0, 1]).inject[
      "fs:DECKGL_FILTER_COLOR"
    ];

    expect(reversed).not.toEqual(forward);
    expect(forward).toContain("vec3(0.9686274509803922,");
    expect(reversed).toContain("vec3(0.03137254901960784,");
  });
});
