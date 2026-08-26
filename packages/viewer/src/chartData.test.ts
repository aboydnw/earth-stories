import { describe, expect, it } from "vitest";
import { pixelForPoint } from "./chartData.js";

const northUpTransform = [0.5, 0, -180, 0, -0.5, 90] as const;

describe("pixelForPoint", () => {
  it("maps a coordinate to its row and column on a north-up grid", () => {
    expect(pixelForPoint(northUpTransform, [-180, 90])).toEqual([0, 0]);
    expect(pixelForPoint(northUpTransform, [-179.5, 89.5])).toEqual([1, 1]);
    expect(pixelForPoint(northUpTransform, [0, 0])).toEqual([180, 360]);
  });

  it("returns negative indices for coordinates above and left of the grid", () => {
    const [row, column] = pixelForPoint(northUpTransform, [-181, 91]);

    expect(row).toBeLessThan(0);
    expect(column).toBeLessThan(0);
  });
});
