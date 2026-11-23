import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import {
  parseStoryProject,
  visualSequenceSchema,
  sceneFrame,
} from "@earth-stories/story-schema";
import { compileProject } from "./compile.js";
import { buildArchivalHtml } from "./archive.js";
const sequence = visualSequenceSchema.parse({
  id: "scene",
  alt: "Moving boundary",
  caption: "Illustrative",
  scene: {
    width: 1000,
    height: 800,
    layers: [
      {
        id: "shape",
        kind: "path",
        pathData: "M 0 0 L 1 0 L .5 1 Z",
        keyframes: [
          { at: 0, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1, rotation: 0 },
          { at: 1, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1, rotation: 180 },
        ],
      },
    ],
  },
  steps: [
    { chapterId: "a", start: 0, end: 0.5 },
    { chapterId: "b", start: 0.5, end: 1 },
  ],
});
it("preserves sequences through deterministic compilation and accessible archival stills", async () => {
  const base = parseStoryProject(
    JSON.parse(await readFile("fixtures/field-notes/story.json", "utf8")),
  );
  const project = {
    ...base,
    sources: [],
    chapters: [
      {
        id: "a",
        type: "prose" as const,
        title: "First",
        narrative: "Original first passage",
      },
      {
        id: "b",
        type: "illustrated" as const,
        scene: sequence.scene,
        alt: "Original drawing",
        caption: "Original attribution",
        title: "Second",
        narrative: "Original second passage",
      },
    ],
    visualSequences: [
      {
        ...sequence,
        scene: { ...sequence.scene, staticProgress: 0.25, motionStrength: 0.5 },
      },
    ],
  };
  const manifest = compileProject(project);
  expect(manifest.visualSequences).toEqual(project.visualSequences);
  expect(compileProject(project)).toEqual(manifest);
  expect(compileProject({ ...project, visualSequences: [] }).build.id).not.toBe(
    manifest.build.id,
  );
  expect(sceneFrame(sequence.scene, 0.5)[0]!.rotation).toBe(90);
  const html = await buildArchivalHtml({
    project,
    manifest,
    projectDirectory: "/tmp",
  });
  expect(html).toContain("Original first passage");
  expect(html).toContain("Original second passage");
  expect(html).toContain("Original drawing");
  expect(html).toContain("Original attribution");
  expect(html.match(/data:image\/svg\+xml;base64,/g)).toHaveLength(3);
  const stills = [...html.matchAll(/data:image\/svg\+xml;base64,([^"]+)/g)].map(
    (match) => Buffer.from(match[1]!, "base64").toString("utf8"),
  );
  expect(stills[0]).toContain("rotate(45 ");
  expect(stills[1]).toContain("rotate(67.5 ");
  expect(() =>
    compileProject({
      ...project,
      visualSequences: [
        { ...sequence, steps: [{ chapterId: "missing", start: 0, end: 1 }] },
      ],
    }),
  ).toThrow();
});

it("includes companion artwork in the static archival edition", async () => {
  const base = parseStoryProject(
    JSON.parse(await readFile("fixtures/field-notes/story.json", "utf8")),
  );
  const { visualAccentSchema } = await import("@earth-stories/story-schema");
  const project = {
    ...base,
    visualAccents: [
      visualAccentSchema.parse({
        id: "accent",
        chapterId: base.chapters[0]!.id,
        placement: "leading",
        alt: "Illustrative clouds",
        scene: sequence.scene,
      }),
    ],
  };
  const html = await buildArchivalHtml({
    project,
    manifest: compileProject(project),
    projectDirectory: "/tmp",
  });
  expect(html).toContain('alt="Illustrative clouds"');
  expect(html).toContain("data:image/svg+xml;base64,");
});
