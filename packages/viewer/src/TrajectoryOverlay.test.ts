import { describe, expect, it } from "vitest";
import { normalizeTracks } from "./TrajectoryOverlay.js";

describe("normalizeTracks", () => {
  it("preserves timestamp-less tracks for static rendering", () => {
    expect(
      normalizeTracks([
        {
          path: [
            [0, 0],
            [1, 1],
            [2, 2],
          ],
          timestamps: null,
        },
      ]),
    ).toEqual([
      {
        path: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
        timestamps: null,
      },
    ]);
  });

  it("aligns timed paths and timestamps to their shared length", () => {
    expect(
      normalizeTracks([
        {
          path: [
            [0, 0],
            [1, 1],
            [2, 2],
          ],
          timestamps: [10, 20],
        },
      ]),
    ).toEqual([
      {
        path: [
          [0, 0],
          [1, 1],
        ],
        timestamps: [10, 20],
      },
    ]);
  });
});
