import type {
  Camera,
  ProjectChapter,
  ProjectSource,
} from "@earth-stories/story-schema";
import { StatusBadge } from "@earth-stories/ui";
import { ChartChapterEditor } from "./chapter-editors/ChartChapterEditor";
import { FlyoverChapterEditor } from "./chapter-editors/FlyoverChapterEditor";
import { ImageChapterEditor } from "./chapter-editors/ImageChapterEditor";
import { MapChapterEditor } from "./chapter-editors/MapChapterEditor";
import { ProseChapterEditor } from "./chapter-editors/ProseChapterEditor";
import { VideoChapterEditor } from "./chapter-editors/VideoChapterEditor";

export interface ChapterInspectorReadiness {
  tone: "ready" | "warning" | "error";
  label: string;
}

const typeLabels: Record<ProjectChapter["type"], string> = {
  prose: "Text",
  map: "Map",
  scrolly: "Guided map",
  image: "Image",
  video: "Video",
  chart: "Chart",
  flyover: "Flyover",
};

export function ChapterInspector({
  chapter,
  chapterIndex,
  sources,
  sourceUsage,
  readiness,
  currentCamera,
  onUpdateChapter,
  onEditSource,
  onAddData,
  onPreviewCamera,
  projectId,
}: {
  chapter: ProjectChapter | null;
  chapterIndex: number;
  sources: ProjectSource[];
  sourceUsage: Record<string, number>;
  readiness: ChapterInspectorReadiness;
  currentCamera: Camera | null;
  onUpdateChapter: (next: ProjectChapter) => void;
  onEditSource: (sourceId: string) => void;
  onAddData: () => void;
  onPreviewCamera?: (camera: Camera) => void;
  projectId?: string;
}) {
  if (!chapter)
    return (
      <div className="chapter-inspector-empty" role="status">
        Choose a chapter to edit its content and presentation.
      </div>
    );
  const common = { sources, sourceUsage, onEditSource, onAddData };
  return (
    <div className="chapter-inspector">
      <header className="chapter-inspector__heading">
        <div>
          <p>
            Chapter {String(chapterIndex + 1).padStart(2, "0")} ·{" "}
            {typeLabels[chapter.type]}
          </p>
          <h2>{chapter.title || "Untitled chapter"}</h2>
          <span>
            Changes here affect only this chapter unless marked as shared.
          </span>
        </div>
        <StatusBadge
          tone={
            readiness.tone === "ready"
              ? "success"
              : readiness.tone === "error"
                ? "danger"
                : "warning"
          }
        >
          {readiness.label}
        </StatusBadge>
      </header>
      {chapter.type === "prose" ? (
        <ProseChapterEditor chapter={chapter} onChange={onUpdateChapter} />
      ) : null}
      {chapter.type === "map" || chapter.type === "scrolly" ? (
        <MapChapterEditor
          {...common}
          chapter={chapter}
          onChange={onUpdateChapter}
        />
      ) : null}
      {chapter.type === "image" ? (
        <ImageChapterEditor
          {...common}
          chapter={chapter}
          projectId={projectId}
          onChange={onUpdateChapter}
        />
      ) : null}
      {chapter.type === "video" ? (
        <VideoChapterEditor chapter={chapter} onChange={onUpdateChapter} />
      ) : null}
      {chapter.type === "chart" ? (
        <ChartChapterEditor
          {...common}
          chapter={chapter}
          onChange={onUpdateChapter}
        />
      ) : null}
      {chapter.type === "flyover" ? (
        <FlyoverChapterEditor
          {...common}
          chapter={chapter}
          currentCamera={currentCamera}
          onChange={onUpdateChapter}
          onPreviewCamera={onPreviewCamera ?? (() => undefined)}
        />
      ) : null}
    </div>
  );
}
