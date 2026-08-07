import { describe, expect, it } from "vitest";
import { geoJsonBounds } from "./geoBounds.js";

describe("geoJsonBounds", () => {
  it("collects bounds across nested feature geometries", () => {
    expect(
      geoJsonBounds({
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Point", coordinates: [4, 7] } },
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [-2, 3],
                [8, -1],
              ],
            },
          },
        ],
      }),
    ).toEqual([-2, -1, 8, 7]);
  });

  it("returns null when no coordinates are present", () => {
    expect(
      geoJsonBounds({ type: "FeatureCollection", features: [] }),
    ).toBeNull();
  });
});
