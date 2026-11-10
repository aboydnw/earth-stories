import { describe, expect, it } from "vitest";
import { normalizeTracks, trackPositionAtTime } from "./TrajectoryOverlay.js";

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

describe("trackPositionAtTime", () => {
  const track = {
    path: [
      [-80, 25],
      [-82, 26],
      [-86, 28],
    ] as [number, number][],
    timestamps: [0, 10, 30],
  };
  it("shows the first and last fix at the ends of the record", () => {
    expect(trackPositionAtTime(track, 0)).toEqual([-80, 25]);
    expect(trackPositionAtTime(track, 30)).toEqual([-86, 28]);
  });
  it("interpolates by elapsed time, not fix index", () => {
    expect(trackPositionAtTime(track, 20)).toEqual([-84, 27]);
  });
  it("does not show a center outside a track's own recorded period", () => {
    expect(trackPositionAtTime(track, -1)).toBeNull();
    expect(trackPositionAtTime(track, 31)).toBeNull();
  });
  it("does not invent timing for static tracks", () => {
    expect(trackPositionAtTime({ ...track, timestamps: null }, 20)).toBeNull();
  });
});
