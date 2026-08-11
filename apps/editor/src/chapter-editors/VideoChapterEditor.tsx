import { useEffect, useState } from "react";
import type { ProjectChapter } from "@earth-stories/story-schema";
import {
  FormField,
  InspectorSection,
  StatusBadge,
  TextArea,
  TextInput,
} from "@earth-stories/ui";
import { analyzeStoredVideo, parseVideoUrl } from "../videoUrl";
import { ChapterContentSection } from "./ChapterContentSection";

type VideoChapter = Extract<ProjectChapter, { type: "video" }>;

export function VideoChapterEditor({
  chapter,
  onChange,
}: {
  chapter: VideoChapter;
  onChange: (next: VideoChapter) => void;
}) {
  const [draft, setDraft] = useState(chapter.originalUrl);
  useEffect(
    () => setDraft(chapter.originalUrl),
    [chapter.id, chapter.originalUrl],
  );
  const parsed = parseVideoUrl(draft);
  const stored = analyzeStoredVideo(chapter);
  const error =
    draft.trim() && !parsed ? "Use a public YouTube or Vimeo URL." : undefined;
  const mismatch = stored.status !== "valid" && draft === chapter.originalUrl;
  return (
    <div className="chapter-type-editor">
      <ChapterContentSection
        chapter={chapter}
        onChange={(next) => onChange(next as VideoChapter)}
        titleOnly
      />
      <InspectorSection
        title="Video"
        description="Paste one public video URL. Provider and embed ID are detected automatically."
      >
        <div className="chapter-editor-fields">
          <FormField
            label="Video URL"
            error={error}
            hint={
              mismatch
                ? "Stored URL and video embed disagree. Re-enter URL to reconcile."
                : undefined
            }
          >
            <TextInput
              value={draft}
              inputMode="url"
              onChange={(event) => {
                const value = event.target.value;
                setDraft(value);
                const next = parseVideoUrl(value);
                if (next) onChange({ ...chapter, ...next });
              }}
            />
          </FormField>
          {parsed ? (
            <StatusBadge tone="success">
              Detected {parsed.provider === "youtube" ? "YouTube" : "Vimeo"}
            </StatusBadge>
          ) : null}
        </div>
      </InspectorSection>
      <InspectorSection
        title="Caption"
        description="Optional context shown with the video."
      >
        <FormField label="Narrative">
          <TextArea
            rows={6}
            value={chapter.narrative}
            onChange={(event) =>
              onChange({ ...chapter, narrative: event.target.value })
            }
          />
        </FormField>
      </InspectorSection>
    </div>
  );
}
