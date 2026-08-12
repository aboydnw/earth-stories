import { useId, useRef } from "react";
import type { ProjectChapter } from "@earth-stories/story-schema";
import {
  FormField,
  InspectorSection,
  TextArea,
  TextInput,
} from "@earth-stories/ui";
import { MarkdownToolbar } from "../MarkdownToolbar";

export function ChapterContentSection({
  chapter,
  onChange,
  titleOnly = false,
}: {
  chapter: ProjectChapter;
  onChange: (next: ProjectChapter) => void;
  titleOnly?: boolean;
}) {
  const narrativeRef = useRef<HTMLTextAreaElement>(null);
  const narrativeId = useId();
  const narrativeHintId = `${narrativeId}-hint`;
  return (
    <InspectorSection
      title="Content"
      description={
        titleOnly ? undefined : "The words readers see with this chapter."
      }
    >
      <div className="chapter-editor-fields">
        <FormField label="Chapter title">
          <TextInput
            value={chapter.title}
            onChange={(event) =>
              onChange({ ...chapter, title: event.target.value })
            }
          />
        </FormField>
        {!titleOnly ? (
          <div className="chapter-editor-markdown">
            <label htmlFor={narrativeId}>Narrative</label>
            <MarkdownToolbar
              textareaRef={narrativeRef}
              value={chapter.narrative}
              onChange={(narrative) => onChange({ ...chapter, narrative })}
            />
            <TextArea
              id={narrativeId}
              ref={narrativeRef}
              rows={7}
              aria-describedby={
                !chapter.narrative.trim() ? narrativeHintId : undefined
              }
              value={chapter.narrative}
              onChange={(event) =>
                onChange({ ...chapter, narrative: event.target.value })
              }
            />
            {!chapter.narrative.trim() ? (
              <small id={narrativeHintId}>
                Add context so readers know what to notice.
              </small>
            ) : null}
          </div>
        ) : null}
      </div>
    </InspectorSection>
  );
}
