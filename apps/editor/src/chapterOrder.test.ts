import { describe, expect, it } from "vitest";
import type { ProjectChapter } from "@earth-stories/story-schema";
import { reorderChapters } from "./chapterOrder";

const chapters = ["a", "b", "c"].map(
  (id) => ({ id, type: "prose", title: id, narrative: "" }) as ProjectChapter,
);

describe("reorderChapters", () => {
  it("supports repeated moves in either direction", () => {
    const once = reorderChapters(chapters, "a", 1);
    const twice = reorderChapters(once, "a", 1);
    expect(twice.map(({ id }) => id)).toEqual(["b", "c", "a"]);
    expect(reorderChapters(twice, "a", -1).map(({ id }) => id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("is unchanged at a boundary or for a missing chapter", () => {
    expect(reorderChapters(chapters, "a", -1)).toBe(chapters);
    expect(reorderChapters(chapters, "missing", 1)).toBe(chapters);
  });
});
