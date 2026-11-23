import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseStoryProject, storyProjectSchema } from "./project.js";
const project = parseStoryProject(
  JSON.parse(
    readFileSync(
      new URL("../../../fixtures/field-notes/story.json", import.meta.url),
      "utf8",
    ),
  ),
);
const accent = {
  id: "clouds",
  chapterId: project.chapters[0]!.id,
  placement: "margin",
  alt: "Clouds gathering",
  scene: {
    width: 1000,
    height: 500,
    layers: [{ id: "cloud", kind: "path", pathData: "M 0 0 L 1 0 L .5 1 Z" }],
  },
};
it("preserves companion art through compilation and project serialization", () => {
  const parsed = storyProjectSchema.parse({
    ...project,
    visualAccents: [accent],
  });
  expect(parsed.visualAccents?.[0]).toMatchObject(accent);
  expect(parseStoryProject(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  expect(parsed.chapters).toEqual(project.chapters);
  expect(storyProjectSchema.parse(project)).not.toHaveProperty("visualAccents");
});
it("rejects orphaned or duplicate accents and executable geometry", () => {
  for (const visualAccents of [
    [{ ...accent, chapterId: "missing" }],
    [accent, accent],
    [
      {
        ...accent,
        scene: {
          ...accent.scene,
          layers: [
            { ...accent.scene.layers[0], pathData: "<script>evil()</script>" },
          ],
        },
      },
    ],
  ])
    expect(
      storyProjectSchema.safeParse({ ...project, visualAccents }).success,
    ).toBe(false);
});

it("rejects artwork attached to a chapter already inside a continuous scene", () => {
  expect(
    storyProjectSchema.safeParse({
      ...project,
      visualAccents: [accent],
      visualSequences: [
        {
          id: "opening",
          alt: "Opening",
          caption: "",
          scene: accent.scene,
          steps: [{ chapterId: accent.chapterId, start: 0, end: 1 }],
        },
      ],
    }).success,
  ).toBe(false);
});

it("rejects duplicate targets, image payloads, and the combined visual budget", () => {
  expect(
    storyProjectSchema.safeParse({
      ...project,
      visualAccents: [accent, { ...accent, id: "second" }],
    }).success,
  ).toBe(false);
  expect(
    storyProjectSchema.safeParse({
      ...project,
      visualAccents: [
        {
          ...accent,
          scene: {
            ...accent.scene,
            layers: [
              { id: "image", kind: "image", sourceId: "remote", alt: "Remote" },
            ],
          },
        },
      ],
    }).success,
  ).toBe(false);
  const chapters = Array.from({ length: 6 }, (_, i) => ({
    id: `chapter-${i}`,
    type: "prose",
    title: "Chapter",
    narrative: "Original",
  }));
  // Each scene remains below its own geometry cap, but six exceed the total.
  const scene = {
    ...accent.scene,
    layers: Array.from({ length: 6 }, (_, i) => ({
      id: `line-${i}`,
      kind: "path",
      pathData: "M 0 0 " + "L .1 .1 ".repeat(2400),
    })),
  };
  const visualAccents = chapters.map((c) => ({
    ...accent,
    id: c.id,
    chapterId: c.id,
    scene,
  }));
  const result = storyProjectSchema.safeParse({
    ...project,
    chapters,
    visualAccents,
  });
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues.some((i) => i.message.includes("600,000"))).toBe(
      true,
    );
});
