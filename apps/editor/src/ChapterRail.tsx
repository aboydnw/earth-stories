import type { ReactNode, Ref } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Copy,
  Database,
  GearSix,
  House,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import type { ProjectChapter } from "@earth-stories/story-schema";
import type { EditorRegion } from "./EditorViewTabs";

export type ChapterRailMode = "chapter" | "story" | "data";
export interface ChapterRailReadiness {
  tone: "ready" | "warning" | "error";
  label: string;
  findings?: Array<{ message: string }>;
}

export function ChapterRail({
  projectTitle,
  chapters,
  activeChapterId,
  mode,
  readiness,
  onWorkspace,
  onStory,
  onStoryData,
  onSelectChapter,
  onRequestRegion,
  onMove,
  onDuplicate,
  onDelete,
  addChapter,
  addChapterRef,
}: {
  projectTitle: string;
  chapters: ProjectChapter[];
  activeChapterId: string;
  mode: ChapterRailMode;
  readiness: Record<string, ChapterRailReadiness | undefined>;
  onWorkspace: () => void;
  onStory: () => void;
  onStoryData: () => void;
  onSelectChapter: (chapterId: string) => void;
  onRequestRegion: (region: EditorRegion) => void;
  onMove: (chapterId: string, direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  addChapter: ReactNode;
  addChapterRef?: Ref<HTMLDivElement>;
}) {
  return (
    <aside className="editor-rail">
      <div className="project-label">
        <button type="button" onClick={onWorkspace}>
          <House size={15} /> Workspace
        </button>
        <span>Editing</span>
        <strong>{projectTitle || "Untitled story"}</strong>
      </div>
      <button
        className={mode === "story" ? "rail-mode is-active" : "rail-mode"}
        type="button"
        onClick={onStory}
      >
        <GearSix size={16} />
        <span>
          <strong>Story settings</strong>
          <small>Title, theme, basemap and credits</small>
        </span>
      </button>
      <nav aria-label="Story chapters">
        <div className="rail-section-heading">
          <p>Chapters</p>
          <span>{chapters.length}</span>
        </div>
        {chapters.map((chapter, index) => {
          const active = chapter.id === activeChapterId && mode === "chapter";
          const status = readiness[chapter.id];
          const StatusIcon =
            status?.tone === "ready" ? CheckCircle : WarningCircle;
          const readinessDescriptionId = status?.findings?.length
            ? `chapter-readiness-${chapter.id}`
            : undefined;
          return (
            <div
              className={active ? "chapter-item is-active" : "chapter-item"}
              key={chapter.id}
            >
              <button
                type="button"
                className="chapter-link"
                aria-current={active ? "page" : undefined}
                aria-describedby={readinessDescriptionId}
                onClick={() => {
                  onSelectChapter(chapter.id);
                  onRequestRegion("edit");
                }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{chapter.title || "Untitled"}</strong>
                <small>{chapter.type}</small>
                {status ? (
                  <small
                    className="chapter-item__readiness"
                    data-tone={status.tone}
                    title={status.findings
                      ?.map(({ message }) => message)
                      .join("\n")}
                  >
                    <StatusIcon size={12} aria-hidden="true" /> {status.label}
                    {readinessDescriptionId ? (
                      <span
                        className="chapter-item__readiness-detail"
                        id={readinessDescriptionId}
                      >
                        {status
                          .findings!.map(({ message }) => message)
                          .join(" ")}
                      </span>
                    ) : null}
                  </small>
                ) : null}
              </button>
              {active ? (
                <div
                  className="chapter-item__actions"
                  role="group"
                  aria-label={`Actions for ${chapter.title || "Untitled chapter"}`}
                >
                  <button
                    type="button"
                    onClick={() => onMove(chapter.id, -1)}
                    disabled={index === 0}
                    aria-label="Move chapter up"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(chapter.id, 1)}
                    disabled={index === chapters.length - 1}
                    aria-label="Move chapter down"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={onDuplicate}
                    aria-label="Duplicate chapter"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={chapters.length === 1}
                    aria-label="Delete chapter"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
      <div className="chapter-add" ref={addChapterRef}>
        {addChapter}
      </div>
      <button
        className={
          mode === "data"
            ? "rail-mode rail-mode--data is-active"
            : "rail-mode rail-mode--data"
        }
        type="button"
        onClick={onStoryData}
      >
        <Database size={16} />
        <span>
          <strong>Story data</strong>
          <small>Import or connect a source</small>
        </span>
      </button>
    </aside>
  );
}
