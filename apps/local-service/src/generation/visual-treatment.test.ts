import { expect, it } from "vitest";
import { inspectVisualTreatment } from "./visual-treatment.js";
import type { StoryPlan, StoryProject } from "@earth-stories/story-schema";
const source = {
  chapters: [
    { id: "intro", type: "prose", title: "Arrival" },
    { id: "formation", type: "scrolly", title: "Formation" },
    { id: "peak", type: "scrolly", title: "Peak" },
    { id: "landfall", type: "scrolly", title: "Landfall" },
    { id: "chart", type: "chart", title: "Wind speed" },
    { id: "credits", type: "prose", title: "How this story was built" },
  ],
} as StoryProject;
const scene = { layers: [{ kind: "path", pathData: "M 0 0 L 1 0 L .5 1 Z" }] };
const opening = {
  id: "opening",
  scene,
  steps: [{ chapterId: "intro", start: 0, end: 1 }],
};
const plan = {
  chapters: [
    { id: "interlude", type: "illustrated", scene, afterChapterId: "landfall" },
  ],
  visualSequences: [opening],
  visualAccents: [
    { id: "companion", chapterId: "peak", scene, placement: "trailing" },
  ],
} as StoryPlan;
it("requires distinct renderable treatments beyond the opening", () => {
  expect(
    inspectVisualTreatment({ ...plan, chapters: [], visualAccents: [] }, source)
      .length,
  ).toBeGreaterThan(0);
  expect(
    inspectVisualTreatment(
      {
        ...plan,
        visualSequences: [],
        visualAccents: [],
        chapters: [...plan.chapters, ...plan.chapters, ...plan.chapters],
      },
      source,
    ).length,
  ).toBeGreaterThan(0);
  expect(inspectVisualTreatment(plan, source)).toEqual([]);
});
it("rejects a quota met only by credits or by artwork clustered at the start", () => {
  expect(
    inspectVisualTreatment(
      {
        ...plan,
        visualAccents: [{ ...plan.visualAccents![0]!, chapterId: "credits" }],
      },
      source,
    ).length,
  ).toBeGreaterThan(0);
  expect(
    inspectVisualTreatment(
      {
        ...plan,
        chapters: [{ ...plan.chapters[0]!, afterChapterId: "intro" }],
        visualAccents: [{ ...plan.visualAccents![0]!, chapterId: "formation" }],
      },
      source,
    ).length,
  ).toBeGreaterThan(0);
});
it("offers focused treatment for a story too short for whole-story coverage", () => {
  expect(
    inspectVisualTreatment(plan, {
      ...source,
      chapters: source.chapters.slice(0, 1),
    }).join(" "),
  ).toMatch(/focused/i);
});

it("keeps a continuous map group intact", () => {
  expect(
    inspectVisualTreatment(
      { ...plan, chapters: [{ ...plan.chapters[0]!, afterChapterId: "peak" }] },
      source,
    ).join(" "),
  ).toMatch(/map group/);
});
