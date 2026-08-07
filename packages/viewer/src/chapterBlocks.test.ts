import { describe, expect, it } from "vitest";
import type { PublicationChapter } from "@earth-stories/story-schema";
import { groupChaptersIntoBlocks } from "./chapterBlocks.js";

const chapter = (id: string, type: PublicationChapter["type"]) =>
  ({ id, type }) as PublicationChapter;

describe("groupChaptersIntoBlocks", () => {
  it("groups adjacent scrollytelling chapters around independent content", () => {
    const blocks = groupChaptersIntoBlocks([
      chapter("intro", "prose"),
      chapter("one", "scrolly"),
      chapter("two", "scrolly"),
      chapter("map", "map"),
      chapter("three", "scrolly"),
    ]);

    expect(blocks.map((block) => block.type)).toEqual([
      "chapter",
      "scrolly",
      "chapter",
      "scrolly",
    ]);
    expect(blocks[1]).toMatchObject({
      startIndex: 1,
      chapters: [{ id: "one" }, { id: "two" }],
    });
    expect(blocks[3]).toMatchObject({ startIndex: 4 });
  });
});
