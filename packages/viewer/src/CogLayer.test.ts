import { describe, expect, it } from "vitest";
import { colorize } from "./CogLayer.js";

describe("colorize", () => {
  it("emits float literals for integer rescale and category values", () => {
    const module = colorize("terrain", { "0": "#ffffff" }, [0, 1]);
    const shader = module.inject["fs:DECKGL_FILTER_COLOR"];

    expect(shader).toContain("float rawValue = 0.0 + value * 1.0;");
    expect(shader).toContain("rawValue - 0.0");
    expect(shader).toContain("vec3(1.0,1.0,1.0)");
  });
});
