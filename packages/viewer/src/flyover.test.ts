import { describe, expect, it } from "vitest";
import {
  interpolateFlyover,
  shortestBearing,
  unwrapLongitudes,
} from "./flyover.js";

describe("flyover interpolation", () => {
  it("uses the shortest bearing arc", () => {
    expect(shortestBearing(350, 10, 0.5)).toBe(0);
  });

  it("unwraps longitudes across the antimeridian", () => {
    expect(unwrapLongitudes([170, -170, -160])).toEqual([170, 190, 200]);
  });

  it("interpolates camera endpoints", () => {
    const frames = [
      { center: [0, 0], zoom: 2, bearing: 350, pitch: 0 },
      { center: [10, 10], zoom: 4, bearing: 10, pitch: 40 },
    ] as const;
    expect(interpolateFlyover(frames as never, 0)?.center).toEqual([0, 0]);
    expect(interpolateFlyover(frames as never, 1)?.center).toEqual([10, 10]);
  });
});
