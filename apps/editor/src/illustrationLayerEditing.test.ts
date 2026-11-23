import { expect, it } from "vitest";
import {
  sceneLayerSchema,
  sceneFrame,
  defaultScene,
} from "@earth-stories/story-schema";
import {
  positionLayer,
  resizeLayer,
  motionLayer,
} from "./illustrationLayerEditing";

const layer = sceneLayerSchema.parse({
  id: "mist",
  kind: "image",
  sourceId: "clouds",
  alt: "Mist",
  width: 0.8,
  height: 0.6,
  keyframes: [
    { at: 0, x: 0.1, y: 0.2, scale: 1, opacity: 1, reveal: 1 },
    { at: 1, x: 0.15, y: 0.3, scale: 1, opacity: 1, reveal: 1 },
  ],
});
it("moves the entire animation track without losing its source or changing its motion", () => {
  const moved = positionLayer(layer, "x", 0.25);
  expect(moved.keyframes.map((k) => k.x)).toEqual([0.35, 0.4]);
  expect(moved.kind === "image" && moved.sourceId).toBe("clouds");
  expect(positionLayer(layer, "x", Infinity)).toEqual(layer);
});
it("resizes proportionally and refuses an out-of-bounds dimension", () => {
  expect(resizeLayer(layer, 0.4)).toMatchObject({ width: 0.4, height: 0.3 });
  expect(resizeLayer(layer, 0)).toEqual(layer);
});
it("produces restrained movement and a stable still without changing the base artwork", () => {
  const next = motionLayer(layer, "rise");
  const scene = { ...defaultScene(), staticProgress: 0, layers: [next] };
  expect(sceneFrame(scene, 0)[0]?.y).toBe(0);
  expect(sceneFrame(scene, 1)[0]?.y).toBe(-0.04);
  expect(sceneFrame({ ...scene, motionStrength: 0 }, 1)[0]?.y).toBe(0);
  expect(motionLayer(next, "still").keyframes).toEqual([]);
});
