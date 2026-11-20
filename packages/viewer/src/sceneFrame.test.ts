import { expect, it } from "vitest";
import { sceneSchema } from "@earth-stories/story-schema";
import { sceneFrame } from "./sceneFrame.js";
const scene = sceneSchema.parse({
  width: 1000,
  height: 600,
  layers: [
    {
      id: "label",
      kind: "text",
      text: "River",
      fontSize: 0.04,
      colorRole: "text",
      keyframes: [
        { at: 0, x: 0, y: 0, scale: 1, opacity: 0, reveal: 0 },
        { at: 1, x: 1, y: 0.5, scale: 2, opacity: 1, reveal: 1 },
      ],
    },
  ],
});
it("interpolates and clamps frame values deterministically", () => {
  expect(sceneFrame(scene, 0.5)[0]).toEqual({
    id: "label",
    x: 0.5,
    y: 0.25,
    scale: 1.5,
    opacity: 0.5,
    reveal: 0.5,
  });
  expect(sceneFrame(scene, -1)[0]?.x).toBe(0);
  expect(sceneFrame(scene, 2)[0]?.x).toBe(1);
});
it("uses the authored static frame when motion strength is zero", () => {
  expect(
    sceneFrame({ ...scene, staticProgress: 0.5, motionStrength: 0 }, 0)[0]?.x,
  ).toBe(0.5);
});
it("keeps layers without tracks at their authored placement", () => {
  expect(
    sceneFrame(
      {
        ...scene,
        layers: [
          { ...scene.layers[0]!, x: 0.3, y: 0.2, opacity: 0.7, keyframes: [] },
        ],
      },
      0.5,
    )[0],
  ).toEqual({ id: "label", x: 0.3, y: 0.2, scale: 1, opacity: 0.7, reveal: 1 });
});
