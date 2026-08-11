import type { ProjectChapter } from "@earth-stories/story-schema";
import { ChapterContentSection } from "./ChapterContentSection";

type ProseChapter = Extract<ProjectChapter, { type: "prose" }>;
export function ProseChapterEditor({
  chapter,
  onChange,
}: {
  chapter: ProseChapter;
  onChange: (next: ProseChapter) => void;
}) {
  return (
    <ChapterContentSection
      chapter={chapter}
      onChange={(next) => onChange(next as ProseChapter)}
    />
  );
}
