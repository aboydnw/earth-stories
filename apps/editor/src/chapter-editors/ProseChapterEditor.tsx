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
    <div className="chapter-type-editor">
      <ChapterContentSection
        chapter={chapter}
        onChange={(next) => onChange(next as ProseChapter)}
      />
    </div>
  );
}
