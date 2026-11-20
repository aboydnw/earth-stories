import { describe, expect, it } from "vitest";
import {
  sceneSchema,
  sceneKeyframeSchema,
  readerPaletteSchema,
} from "./illustration.js";
const layer = {
  id: "river",
  kind: "path",
  pathData: "M 0 0 L 1 1",
  fillRole: null,
  strokeRole: "accent",
  strokeWidth: 0.01,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  opacity: 1,
  keyframes: [],
};
const scene = {
  width: 1000,
  height: 600,
  layers: [layer],
  staticProgress: 1,
  motionStrength: 1,
  scrollLength: 2,
};
describe("illustrated scenes", () => {
  it("retains a constrained vector scene and rejects executable markup", () => {
    expect(sceneSchema.parse(scene)).toEqual(scene);
    for (const pathData of [
      '<svg onload="evil()">',
      "M 0 0 L Infinity 1",
      "M 0",
      "url(https://example.org)",
    ])
      expect(
        sceneSchema.safeParse({ ...scene, layers: [{ ...layer, pathData }] })
          .success,
      ).toBe(false);
    expect(
      sceneSchema.safeParse({
        ...scene,
        layers: [{ ...layer, onclick: "evil()" }],
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate layers and unordered or out-of-range tracks", () => {
    expect(
      sceneSchema.safeParse({ ...scene, layers: [layer, layer] }).success,
    ).toBe(false);
    const key = { at: 0, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1 };
    expect(sceneKeyframeSchema.safeParse({ ...key, at: 2 }).success).toBe(
      false,
    );
    expect(
      sceneSchema.safeParse({
        ...scene,
        layers: [{ ...layer, keyframes: [{ ...key, at: 1 }, key] }],
      }).success,
    ).toBe(false);
  });
  it("requires image references and bounds scene complexity", () => {
    expect(
      sceneSchema.safeParse({
        ...scene,
        layers: [{ id: "image", kind: "image", alt: "Landscape" }],
      }).success,
    ).toBe(false);
    expect(
      sceneSchema.safeParse({
        ...scene,
        layers: Array.from({ length: 25 }, (_, i) => ({
          ...layer,
          id: `p${i}`,
        })),
      }).success,
    ).toBe(false);
  });
  it("accepts only palette colors, never CSS expressions", () => {
    expect(
      readerPaletteSchema.safeParse({ background: "url(evil)" }).success,
    ).toBe(false);
    expect(readerPaletteSchema.parse({ background: "#ffffff" })).toEqual({
      background: "#ffffff",
    });
  });
});
