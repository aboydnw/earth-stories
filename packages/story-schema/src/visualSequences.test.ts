import { expect, it } from "vitest";
import {
  visualSequenceSchema,
  validateVisualSequences,
} from "./visualSequences.js";
const sequence = {
  id: "storm",
  alt: "A storm approaching shore",
  caption: "Illustrative",
  scene: {
    width: 1000,
    height: 800,
    layers: [{ id: "cloud", kind: "path", pathData: "M 0 0 L 1 1 Z" }],
  },
  steps: [
    { chapterId: "a", start: 0, end: 0.5 },
    { chapterId: "b", start: 0.5, end: 1 },
  ],
};
const chapters = [
  { id: "a", type: "prose" },
  { id: "b", type: "prose" },
  { id: "map", type: "map" },
];
it("accepts a bounded sequence and rejects invalid narrative anchors", () => {
  const parsed = visualSequenceSchema.parse(sequence);
  expect(validateVisualSequences(chapters, [parsed])).toEqual([]);
  for (const ids of [
    ["a", "missing"],
    ["b", "a"],
    ["a", "a"],
    ["b", "map"],
  ]) {
    expect(
      validateVisualSequences(chapters, [
        {
          ...parsed,
          steps: parsed.steps.map((s, i) => ({ ...s, chapterId: ids[i]! })),
        },
      ]).length,
    ).toBeGreaterThan(0);
  }
  expect(
    validateVisualSequences(chapters, [parsed, { ...parsed, id: "other" }])
      .length,
  ).toBeGreaterThan(0);
});
it("rejects executable content and gaps in animation progress", () => {
  expect(
    visualSequenceSchema.safeParse({
      ...sequence,
      scene: {
        ...sequence.scene,
        layers: [
          {
            ...sequence.scene.layers[0],
            pathData: "<script>alert(1)</script>",
          },
        ],
      },
    }).success,
  ).toBe(false);
  expect(
    visualSequenceSchema.safeParse({
      ...sequence,
      steps: [
        { chapterId: "a", start: 0, end: 0.4 },
        { chapterId: "b", start: 0.5, end: 1 },
      ],
    }).success,
  ).toBe(false);
});

it("returns validation errors rather than throwing for empty steps", () => {
  expect(
    visualSequenceSchema.safeParse({ ...sequence, steps: [] }).success,
  ).toBe(false);
});
