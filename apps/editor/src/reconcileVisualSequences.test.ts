import { expect, it } from "vitest";
import {
  validateVisualSequences,
  sceneFrame,
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
