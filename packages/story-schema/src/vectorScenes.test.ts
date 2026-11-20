import { expect, it } from "vitest";
import { composeVectorScene, vectorRecipeSchema } from "./vectorScenes.js";
import { sceneSchema } from "./illustration.js";
import { sceneFrame } from "./sceneFrame.js";
it.each(["landscape", "flow", "reveal", "diagram"] as const)(
  "composes deterministic editable %s scenes with visible static frames",
  (template) => {
    const recipe = {
      template,
      heading: "A changing watershed",
      labels: ["Headwaters", "Wetlands", "Coast"],
      motif: "river",
      motion: true,
    };
    const scene = composeVectorScene(vectorRecipeSchema.parse(recipe));
    expect(sceneSchema.safeParse(scene).success).toBe(true);
    expect(composeVectorScene(vectorRecipeSchema.parse(recipe))).toEqual(scene);
    expect(scene.layers.length).toBeGreaterThan(4);
    expect(scene.layers.every((l) => l.kind !== "image")).toBe(true);
    expect(
      sceneFrame(scene, scene.staticProgress).every(
        (f) => f.opacity > 0 && f.reveal > 0,
      ),
    ).toBe(true);
    expect(scene.layers.some((l) => l.keyframes.length > 1)).toBe(true);
  },
);
it("bounds labels and rejects arbitrary paths, scripts and templates", () => {
  const base = {
    template: "diagram",
    heading: "Water",
    labels: ["One", "Two"],
    motif: "river",
    motion: false,
  };
  expect(
    vectorRecipeSchema.safeParse({ ...base, labels: ["x".repeat(65)] }).success,
  ).toBe(false);
  expect(
    vectorRecipeSchema.safeParse({ ...base, pathData: "M 0 0" }).success,
  ).toBe(false);
  expect(
    vectorRecipeSchema.safeParse({ ...base, template: "custom-script" })
      .success,
  ).toBe(false);
  expect(
    composeVectorScene(vectorRecipeSchema.parse(base)).layers.every(
      (l) => l.keyframes.length === 0,
    ),
  ).toBe(true);
});
