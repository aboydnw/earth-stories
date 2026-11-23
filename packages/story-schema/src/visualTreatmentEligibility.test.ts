import { expect, it } from "vitest";
import type { StoryProject } from "./project.js";
import { wholeStoryVisualTreatmentIssue } from "./visualTreatmentEligibility.js";

const source = {
  chapters: [
    { id: "opening", type: "illustrated", title: "Arrival" },
    { id: "map", type: "map", title: "The route" },
    { id: "chart", type: "chart", title: "Wind speed" },
    { id: "credits", type: "prose", title: "How this story was built" },
  ],
} as StoryProject;

it("allows a single available illustrated chapter and companion art on a map or chart", () => {
  expect(wholeStoryVisualTreatmentIssue(source)).toBeNull();
});

it("preserves existing companion art that occupies the only immersive chapter", () => {
  const candidate = {
    ...source,
    visualAccents: [{ chapterId: "opening" }],
  } as StoryProject;
  expect(wholeStoryVisualTreatmentIssue(candidate)).toMatch(
    /does not already have.*Focused artwork/,
  );
});

it("preserves an existing sequence on the only immersive chapter", () => {
  const candidate = {
    ...source,
    visualSequences: [{ steps: [{ chapterId: "opening" }] }],
  } as StoryProject;
  expect(wholeStoryVisualTreatmentIssue(candidate)).toMatch(
    /does not already have.*Focused artwork/,
  );
});

it("needs a separate original chapter for companion art", () => {
  const candidate = {
    ...source,
    visualAccents: [{ chapterId: "map" }, { chapterId: "chart" }],
  } as StoryProject;
  expect(wholeStoryVisualTreatmentIssue(candidate)).toMatch(
    /separate available chapters.*Focused artwork/,
  );
});

it.each(["visualSequences", "visualAccents"] as const)(
  "cannot add all three treatments when %s is at its limit",
  (key) => {
    const candidate = {
      ...source,
      [key]: Array.from({ length: 12 }, () => ({})),
    } as StoryProject;
    expect(wholeStoryVisualTreatmentIssue(candidate)).toMatch(
      /reached its limit.*Focused artwork/,
    );
  },
);
