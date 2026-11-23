import { expect, it } from "vitest";
import { artworkMotionSchema, applyArtworkMotion } from "./artworkMotion.js";
import { sceneSchema } from "./illustration.js";
const scene = sceneSchema.parse({
  width: 1000,
  height: 600,
  layers: [
    {
      id: "mist",
      kind: "image",
      sourceId: "upload-1",
      alt: "Mist",
      x: 0.1,
      y: 0.2,
    },
  ],
});
it("accepts only subtle motion for every known image and preserves artwork identity", () => {
  const result = applyArtworkMotion(scene, {
    layers: [{ id: "mist", dx: 0.03, dy: -0.02, scale: 1.04 }],
  });
  expect(result.layers[0]).toMatchObject({
    id: "mist",
    kind: "image",
    sourceId: "upload-1",
    x: 0.1,
  });
  expect(result.layers[0]?.keyframes[1]?.x).toBeCloseTo(0.13);
  expect(result.layers[0]?.keyframes[1]?.y).toBeCloseTo(0.18);
  expect(result.layers[0]?.keyframes[1]?.scale).toBe(1.04);
  expect(() =>
    applyArtworkMotion(scene, {
      layers: [{ id: "unknown", dx: 0, dy: 0, scale: 1 }],
    }),
  ).toThrow();
  expect(() => applyArtworkMotion(scene, { layers: [] })).toThrow();
});
it("rejects scripts, excessive motion and duplicate identities", () => {
  for (const layers of [
    [{ id: "mist", dx: 2, dy: 0, scale: 1 }],
    [{ id: "mist", dx: 0, dy: 0, scale: 1, script: "evil()" }],
    Array.from({ length: 2 }, () => ({ id: "mist", dx: 0, dy: 0, scale: 1 })),
  ])
    expect(artworkMotionSchema.safeParse({ layers }).success).toBe(false);
});
