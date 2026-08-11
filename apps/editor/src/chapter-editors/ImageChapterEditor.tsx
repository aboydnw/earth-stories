import type {
  ProjectChapter,
  ProjectSource,
} from "@earth-stories/story-schema";
import {
  FormField,
  InspectorSection,
  TextArea,
  TextInput,
} from "@earth-stories/ui";
import { ChapterDataSelector } from "../ChapterDataSelector";
import { ChapterContentSection } from "./ChapterContentSection";

type ImageChapter = Extract<ProjectChapter, { type: "image" }>;
export function ImageChapterEditor({
  chapter,
  sources,
  sourceUsage,
  projectId,
  onChange,
  onEditSource,
  onAddData,
}: {
  chapter: ImageChapter;
  sources: ProjectSource[];
  sourceUsage: Record<string, number>;
  projectId?: string;
  onChange: (next: ImageChapter) => void;
  onEditSource: (id: string) => void;
  onAddData: () => void;
}) {
  const images = sources.filter(({ kind }) => kind === "image");
  const source = images.find(({ id }) => id === chapter.sourceId);
  return (
    <div className="chapter-type-editor">
      <ChapterContentSection
        chapter={chapter}
        onChange={(next) => onChange(next as ImageChapter)}
        titleOnly
      />
      <InspectorSection title="Image">
        {source && "path" in source ? (
          <img
            className="chapter-image-thumbnail"
            src={
              projectId
                ? `/api/projects/${encodeURIComponent(projectId)}/assets/${source.path
                    .split("/")
                    .map(encodeURIComponent)
                    .join("/")}`
                : source.path
            }
            alt=""
          />
        ) : null}
        <ChapterDataSelector
          sourceId={chapter.sourceId}
          sources={images}
          usageCount={sourceUsage[chapter.sourceId] ?? 0}
          onSelect={(sourceId) => onChange({ ...chapter, sourceId })}
          onEditSource={onEditSource}
          onAddData={onAddData}
        />
      </InspectorSection>
      <InspectorSection
        title="Alternative text"
        description="Describe the information or meaning carried by the image."
      >
        <FormField
          label="Alternative text"
          error={
            !chapter.alt.trim()
              ? "Add alternative text before publishing."
              : undefined
          }
        >
          <TextInput
            value={chapter.alt}
            onChange={(event) =>
              onChange({ ...chapter, alt: event.target.value })
            }
          />
        </FormField>
      </InspectorSection>
      <InspectorSection title="Caption">
        <div className="chapter-editor-fields">
          <FormField label="Caption">
            <TextInput
              value={chapter.caption}
              onChange={(event) =>
                onChange({ ...chapter, caption: event.target.value })
              }
            />
          </FormField>
          <FormField label="Narrative">
            <TextArea
              rows={5}
              value={chapter.narrative}
              onChange={(event) =>
                onChange({ ...chapter, narrative: event.target.value })
              }
            />
          </FormField>
        </div>
      </InspectorSection>
    </div>
  );
}
