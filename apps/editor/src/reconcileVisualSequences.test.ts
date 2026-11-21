import { expect, it } from "vitest";
import {
  validateVisualSequences,
  sceneFrame,
  projectChapterSchema,
} from "@earth-stories/story-schema";
import { reconcileVisualSequences } from "./reconcileVisualSequences";
import {
  hurricaneSequence,
  visualFixtureChapters,
} from "./visualSequenceFixtures";
it("preserves narrative edits and splits continuity around inserted chapters without losing artwork", () => {
  const inserted = [
    visualFixtureChapters[0]!,
    {
      id: "break",
      type: "prose" as const,
      title: "New",
      narrative: "Independent",
    },
    visualFixtureChapters[1]!,
  ];
  const result = reconcileVisualSequences(inserted, [hurricaneSequence]);
  expect(result).toHaveLength(2);
  expect(validateVisualSequences(inserted, result)).toEqual([]);
  const expected = sceneFrame(
    { ...hurricaneSequence.scene, motionStrength: 1 },
    0.5,
  );
  const actual = sceneFrame({ ...result[1]!.scene, motionStrength: 1 }, 0);
  expect(actual[2]!.rotation).toBe(expected[2]!.rotation);
  expect(actual[2]!.opacity).toBeCloseTo(expected[2]!.opacity);
  expect(
    reconcileVisualSequences([visualFixtureChapters[0]!], [hurricaneSequence]),
  ).toHaveLength(1);
  expect(reconcileVisualSequences([], [hurricaneSequence])).toEqual([]);
});

it("keeps valid rounded step boundaries intact on narrative edits", () => {
  const rounded = structuredClone(hurricaneSequence);
  rounded.steps[1]!.start += 0.0000005;
  expect(
    reconcileVisualSequences(
      visualFixtureChapters.map((c) => ({ ...c, narrative: "Edited" })),
      [rounded],
    ),
  ).toEqual([rounded]);
});

it("splits moved, deleted and media steps without retaining invalid anchors", () => {
  const chapters = [
    visualFixtureChapters[0]!,
    { ...visualFixtureChapters[0]!, id: "middle" },
    visualFixtureChapters[1]!,
  ];
  const sequence = {
    ...hurricaneSequence,
    steps: chapters.map((c, i) => ({
      chapterId: c.id,
      start: i / 3,
      end: (i + 1) / 3,
    })),
  };
  for (const updated of [
    [chapters[2]!, chapters[0]!, chapters[1]!],
    [chapters[0]!, chapters[2]!],
    [
      chapters[0]!,
      projectChapterSchema.parse({
        ...chapters[1]!,
        type: "map",
        sourceId: "map",
        camera: { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 },
      }),
      chapters[2]!,
    ],
  ]) {
    const result = reconcileVisualSequences(updated, [sequence]);
    expect(result).toHaveLength(2);
    expect(validateVisualSequences(updated, result)).toEqual([]);
    expect(new Set(result.map((s) => s.id)).size).toBe(result.length);
  }
});

it.each([0, 0.5])(
  "preserves displayed geometry when splitting motion strength %s",
  (motionStrength) => {
    const sequence = structuredClone(hurricaneSequence);
    sequence.scene.motionStrength = motionStrength;
    sequence.scene.staticProgress = 1;
    const animated = sequence.scene.layers.find(
      (layer) => layer.keyframes.length,
    )!;
    animated.keyframes.splice(1, 0, {
      ...animated.keyframes[0]!,
      at: 0.25,
      x: 0.3,
      rotation: 30,
    });
    const inserted = [
      visualFixtureChapters[0]!,
      { ...visualFixtureChapters[0]!, id: "break" },
      visualFixtureChapters[1]!,
    ];
    const parts = reconcileVisualSequences(inserted, [sequence]);
    for (const [index, part] of parts.entries()) {
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        const expected = sceneFrame(
          sequence.scene,
          index * 0.5 + progress * 0.5,
        );
        const actual = sceneFrame(part.scene, progress);
        for (const [layerIndex, frame] of expected.entries()) {
          for (const key of [
            "x",
            "y",
            "scale",
            "opacity",
            "reveal",
            "rotation",
          ] as const)
            expect(actual[layerIndex]![key] ?? 0).toBeCloseTo(frame[key] ?? 0);
        }
      }
    }
  },
);
