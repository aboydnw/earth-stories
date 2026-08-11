import { describe, expect, it } from "vitest";
import type { Camera, FlyoverKeyframe } from "@earth-stories/story-schema";
import {
  captureKeyframe,
  createApproachPreset,
  createOrbitPreset,
  flyoverWarnings,
  normalizeBearing,
  recaptureKeyframe,
  reorderKeyframe,
} from "./flyoverPath";

const camera: Camera = {
  center: [-77, 38],
  zoom: 8,
  bearing: 350,
  pitch: 35,
  globe: true,
};

describe("flyoverPath", () => {
  it.each([
    [-10, 350],
    [0, 0],
    [360, 0],
    [725, 5],
  ])("normalizes bearing %s to %s", (value, expected) => {
    expect(normalizeBearing(value)).toBe(expected);
  });

  it("captures camera state and preserves captions when recapturing", () => {
    const first = captureKeyframe(camera, "The estuary");
    expect(first).toEqual({ ...camera, caption: "The estuary" });

    const next = recaptureKeyframe(first, { ...camera, zoom: 10 });
    expect(next.zoom).toBe(10);
    expect(next.caption).toBe("The estuary");
  });

  it("reorders frames without mutating the stored path", () => {
    const frames = [
      captureKeyframe(camera, "A"),
      captureKeyframe({ ...camera, zoom: 9 }, "B"),
      captureKeyframe({ ...camera, zoom: 10 }, "C"),
    ];

    expect(reorderKeyframe(frames, 0, 2).map(({ caption }) => caption)).toEqual(
      ["B", "C", "A"],
    );
    expect(frames.map(({ caption }) => caption)).toEqual(["A", "B", "C"]);
  });

  it("builds deterministic bearing-safe Orbit and Approach presets", () => {
    expect(createOrbitPreset(camera, 4).map(({ bearing }) => bearing)).toEqual([
      350, 80, 170, 260, 350,
    ]);
    const approach = createApproachPreset(camera);
    expect(approach.map(({ bearing }) => bearing)).toEqual([350, 350]);
    expect(approach.map(({ zoom }) => zoom)).toEqual([6, 8]);
  });

  it("warns about large zoom jumps", () => {
    const frames: FlyoverKeyframe[] = [
      captureKeyframe(camera),
      captureKeyframe({ ...camera, zoom: 12.5 }),
    ];
    expect(flyoverWarnings(frames)).toEqual([
      "Keyframes 1 and 2 jump 4.5 zoom levels.",
    ]);
  });
});
