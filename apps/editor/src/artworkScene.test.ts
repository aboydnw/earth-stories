import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { compileProject } from "@earth-stories/publisher/compile";
import {
  artworkChapter,
  insertArtworkChapter,
  artworkAnchors,
} from "./artworkScene";
it("uses aligned prepared layers instead of duplicating the original picture", () => {
  const chapter = artworkChapter("scene", "Ice", { width: 1600, height: 900 }, [
    { id: "mountains", name: "Mountains" },
    { id: "ice", name: "Ice" },
  ]);
  expect(
    chapter.scene.layers.map((l) => l.kind === "image" && l.sourceId),
  ).toEqual(["mountains", "ice"]);
  expect(chapter.scene.width / chapter.scene.height).toBeCloseTo(16 / 9);
});
it("adds a chapter without changing original text or splitting a visual sequence", async () => {
  const project = storyProjectSchema.parse(
    JSON.parse(await readFile("fixtures/illustrated-river/story.json", "utf8")),
  );
  const source = project.sources.find((s) => s.kind === "image")!;
  const chapter = artworkChapter(
    "new-scene",
    "Ice",
    { width: 1600, height: 900 },
    [{ id: source.id, name: "Ice" }],
  );
  const updated = insertArtworkChapter(
    project,
    chapter,
    [],
    project.chapters[0]!.id,
  );
  expect(updated.chapters[0]).toEqual(project.chapters[0]);
  expect(updated.chapters[1]?.id).toBe("new-scene");
  expect(updated.chapters.filter((c) => c.id !== "new-scene")).toEqual(
    project.chapters,
  );
  expect(
    compileProject({
      ...updated,
      publication: { ...updated.publication, profile: "custom" },
    }).chapters.some((c) => c.id === "new-scene"),
  ).toBe(true);
  const protectedStory = {
    ...project,
    visualSequences: [
      {
        id: "existing",
        steps: [{ chapterId: project.chapters[0]!.id }, { chapterId: "later" }],
      },
    ],
  } as never;
  expect(
    artworkAnchors(protectedStory).some(
      (c) => c.id === project.chapters[0]!.id,
    ),
  ).toBe(false);
  expect(() =>
    insertArtworkChapter(protectedStory, chapter, [], project.chapters[0]!.id),
  ).toThrow(/sequence/);
});
