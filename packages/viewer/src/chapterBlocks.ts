import type {
  PublicationChapter,
  VisualSequence,
} from "@earth-stories/story-schema";

export type ChapterBlock =
  | {
      type: "visual";
      sequence: VisualSequence;
      chapters: PublicationChapter[];
      startIndex: number;
    }
  | {
      type: "scrolly";
      chapters: Extract<PublicationChapter, { type: "scrolly" }>[];
      startIndex: number;
    }
  | { type: "chapter"; chapter: PublicationChapter; index: number };

export function groupChaptersIntoBlocks(
  chapters: PublicationChapter[],
  sequences: VisualSequence[] = [],
): ChapterBlock[] {
  const blocks: ChapterBlock[] = [];
  let scrolly: Extract<PublicationChapter, { type: "scrolly" }>[] = [];
  let startIndex = 0;

  const flush = () => {
    if (!scrolly.length) return;
    blocks.push({ type: "scrolly", chapters: scrolly, startIndex });
    scrolly = [];
  };

  const sequenceStarts = new Map(
    sequences.map((s) => [s.steps[0]!.chapterId, s]),
  );
  const covered = new Set(
    sequences.flatMap((s) => s.steps.slice(1).map((step) => step.chapterId)),
  );
  chapters.forEach((chapter, index) => {
    const sequence = sequenceStarts.get(chapter.id);
    if (sequence) {
      flush();
      blocks.push({
        type: "visual",
        sequence,
        chapters: chapters.slice(index, index + sequence.steps.length),
        startIndex: index,
      });
      return;
    }
    if (covered.has(chapter.id)) return;
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
