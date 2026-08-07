import type { PublicationChapter } from "@earth-stories/story-schema";

export type ChapterBlock =
  | {
      type: "scrolly";
      chapters: Extract<PublicationChapter, { type: "scrolly" }>[];
      startIndex: number;
    }
  | { type: "chapter"; chapter: PublicationChapter; index: number };

export function groupChaptersIntoBlocks(
  chapters: PublicationChapter[],
): ChapterBlock[] {
  const blocks: ChapterBlock[] = [];
  let scrolly: Extract<PublicationChapter, { type: "scrolly" }>[] = [];
  let startIndex = 0;

  const flush = () => {
    if (!scrolly.length) return;
    blocks.push({ type: "scrolly", chapters: scrolly, startIndex });
    scrolly = [];
  };

  chapters.forEach((chapter, index) => {
    if (chapter.type === "scrolly") {
      if (!scrolly.length) startIndex = index;
      scrolly.push(chapter);
      return;
    }
    flush();
    blocks.push({ type: "chapter", chapter, index });
  });
  flush();
  return blocks;
}
