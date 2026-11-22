import { expect, it } from "vitest";
import { sceneSchema } from "@earth-stories/story-schema";
import { inspectSceneQuality } from "./scene-quality.js";
function scene(x: number, y: number, endX: number, endY: number) {
  return sceneSchema.parse({
    width: 1400,
    height: 960,
    focalX: 0.68,
    layers: [
      {
        id: "vortex",
        kind: "path",
        pathData: "M 0 0 L 1 0 L 1 1 L 0 1 Z",
        x: 0.8,
        y: 0.56,
        width: 0.09,
        height: 0.13,
        keyframes: [
          { at: 0, x, y, scale: 1, opacity: 1, reveal: 1 },
          { at: 1, x: endX, y: endY, scale: 1, opacity: 1, reveal: 1 },
        ],
      },
    ],
  });
}
it("catches offset-like movement that stays outside the composed scene", () => {
  expect(
    inspectSceneQuality(scene(-0.2, -0.2, -0.34, -0.3)).some(
      (i) => i.code === "invisible-motion",
    ),
  ).toBe(true);
});
it("accepts absolute motion and deliberate entrances with visible travel", () => {
  expect(inspectSceneQuality(scene(0.8, 0.56, 0.46, 0.25))).toEqual([]);
  expect(inspectSceneQuality(scene(-0.3, 0.5, 0.8, 0.5))).toEqual([]);
});
it("checks path bounds and opacity rather than only nominal layer rectangles", () => {
  const s = scene(0.2, 0.2, 0.6, 0.2);
  s.layers[0]!.opacity = 0;
  expect(
    inspectSceneQuality(s).some((i) => i.code === "invisible-motion"),
  ).toBe(true);
  s.layers[0]!.opacity = 1;
  (s.layers[0] as any).pathData = "M 3 3 L 4 3 L 4 4 Z";
  expect(
    inspectSceneQuality(s).some((i) => i.code === "invisible-motion"),
  ).toBe(true);
});
it("does not apply immersive cropping to standalone illustrations", () => {
  const low = scene(0.2, 0.85, 0.6, 0.85);
  expect(inspectSceneQuality(low, false)).toEqual([]);
});
it("rejects moving geometry with neither a fill nor a visible stroke", () => {
  const s = scene(0.2, 0.2, 0.6, 0.2);
  const layer = s.layers[0] as any;
  layer.fillRole = null;
  layer.strokeRole = null;
  expect(
    inspectSceneQuality(s).some((i) => i.code === "invisible-motion"),
  ).toBe(true);
});
