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
