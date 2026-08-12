import { useState } from "react";
import type {
  Camera,
  ProjectChapter,
  PublicationManifest,
} from "@earth-stories/story-schema";
import { LEGACY_DEFAULT_CAMERA } from "@earth-stories/story-schema";
import {
  FocusedChapterViewer,
  StoryViewer,
  usesLegacyAutomaticFit,
} from "@earth-stories/viewer";
import { useChapterCameraDraft } from "./useChapterCameraDraft";

export type CanvasMode = "chapter" | "story";

const fallbackCamera: Camera = LEGACY_DEFAULT_CAMERA;

export function ChapterCanvas({
  mode,
  onModeChange,
  selectedChapter,
  focusedManifest,
  fullManifest,
  focusedError,
  savedCamera,
  onCameraCommit,
  onLiveCameraChange,
  previewCamera,
  commitInitialFit = false,
  snapshotMode = false,
}: {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  selectedChapter: ProjectChapter | null;
  focusedManifest: PublicationManifest | null;
  fullManifest: PublicationManifest | null;
  focusedError?: string | null;
  savedCamera: Camera | null;
  onCameraCommit: (camera: Camera) => void;
  onLiveCameraChange?: (chapterId: string, camera: Camera) => void;
  previewCamera?: Camera | null;
  commitInitialFit?: boolean;
  snapshotMode?: boolean;
}) {
  const chapterCamera =
    selectedChapter && "camera" in selectedChapter
      ? selectedChapter.camera
      : fallbackCamera;
  const cameraDraft = useChapterCameraDraft({
    chapterId: selectedChapter?.id ?? "",
    camera: chapterCamera,
    savedCamera: savedCamera ?? chapterCamera,
    onCommit: onCameraCommit,
  });
  const [fitRequest, setFitRequest] = useState<{
    scope: string;
    sequence: number;
  }>();
  const [fitAvailable, setFitAvailable] = useState(false);
  const mapBound =
    selectedChapter?.type === "map" || selectedChapter?.type === "scrolly";
  const interactiveMap = mapBound || selectedChapter?.type === "flyover";
  const automaticFit = mapBound && usesLegacyAutomaticFit(chapterCamera);
  const fitScope = mapBound
    ? `${selectedChapter.id}:${selectedChapter.sourceId}`
    : "";
  const fitRequestToken =
    fitRequest?.scope === fitScope
      ? `${fitRequest.scope}:${fitRequest.sequence}`
      : undefined;

  return (
    <section className="chapter-canvas" aria-label="Chapter canvas">
      <header className="chapter-canvas__header">
        <div className="chapter-canvas__modes" aria-label="Canvas mode">
          <button
            type="button"
            aria-pressed={mode === "chapter"}
            onClick={() => onModeChange("chapter")}
          >
            Edit chapter
          </button>
          <button
            type="button"
            aria-pressed={mode === "story"}
            onClick={() => onModeChange("story")}
          >
            Preview story
          </button>
        </div>
        <span>
          {mode === "story"
            ? "Complete reader preview"
            : selectedChapter?.title || "No chapter selected"}
        </span>
      </header>

      <div className="chapter-canvas__viewport">
        {mode === "story" ? (
          fullManifest ? (
            <StoryViewer manifest={fullManifest} snapshotMode={snapshotMode} />
          ) : (
            <div className="chapter-canvas__state" role="status">
              Complete the remaining story requirements to preview the full
              story.
            </div>
          )
        ) : focusedManifest && selectedChapter ? (
          <FocusedChapterViewer
            key={selectedChapter.id}
            manifest={focusedManifest}
            chapterId={selectedChapter.id}
            interactiveMap={interactiveMap}
            fitRequestToken={fitRequestToken}
            commitAutoFit={commitInitialFit}
            onFitAvailabilityChange={setFitAvailable}
            onFitCameraChange={cameraDraft.applyProgrammaticCamera}
            cameraOverride={previewCamera}
            onCameraChange={
              mapBound
                ? (camera) => {
                    cameraDraft.onUserCameraChange(camera);
                    onLiveCameraChange?.(selectedChapter.id, camera);
                  }
                : onLiveCameraChange
                  ? (camera) => onLiveCameraChange(selectedChapter.id, camera)
                  : undefined
            }
          />
        ) : (
          <div className="chapter-canvas__state" role="status">
            {focusedError ?? "Choose a chapter to start editing."}
          </div>
        )}
      </div>

      {mode === "chapter" && mapBound ? (
        <div
          className="chapter-canvas__map-tools"
          aria-label="Map view actions"
        >
          <span aria-live="polite">
            {automaticFit && cameraDraft.status === "idle"
              ? "Using automatic fit"
              : cameraDraft.status === "changed"
                ? "View changed"
                : cameraDraft.status === "updated"
                  ? "View updated"
                  : "View ready"}
          </span>
          <button
            type="button"
            aria-label="Undo view change"
            disabled={!cameraDraft.canUndo}
            onClick={cameraDraft.undo}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!fitAvailable}
            onClick={() =>
              setFitRequest((value) => ({
                scope: fitScope,
                sequence: value?.scope === fitScope ? value.sequence + 1 : 1,
              }))
            }
          >
            {automaticFit ? "Use fitted view" : "Fit to data"}
          </button>
          <button type="button" onClick={cameraDraft.resetToSaved}>
            Reset to saved view
          </button>
        </div>
      ) : null}
    </section>
  );
}
