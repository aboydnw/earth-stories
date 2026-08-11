import type {
  Camera,
  ProjectChapter,
  ProjectSource,
} from "@earth-stories/story-schema";
import {
  CheckboxField,
  CollapsibleSection,
  FormField,
  InspectorSection,
  NumberInput,
} from "@earth-stories/ui";
import { ChapterDataSelector } from "../ChapterDataSelector";
import { FlyoverPathEditor } from "../FlyoverPathEditor";
import { OverlayListEditor } from "../OverlayListEditor";
import { ChapterContentSection } from "./ChapterContentSection";

type FlyoverChapter = Extract<ProjectChapter, { type: "flyover" }>;
export function FlyoverChapterEditor({
  chapter,
  sources,
  sourceUsage,
  currentCamera,
  onChange,
  onEditSource,
  onAddData,
  onPreviewCamera,
}: {
  chapter: FlyoverChapter;
  sources: ProjectSource[];
  sourceUsage: Record<string, number>;
  currentCamera: Camera | null;
  onChange: (next: FlyoverChapter) => void;
  onEditSource: (id: string) => void;
  onAddData: () => void;
  onPreviewCamera: (camera: Camera) => void;
}) {
  const compatible = sources.filter(
    ({ kind }) => kind !== "image" && kind !== "csv",
  );
  const first = chapter.keyframes[0]!;
  return (
    <div className="chapter-type-editor">
      <ChapterContentSection
        chapter={chapter}
        onChange={(next) => onChange(next as FlyoverChapter)}
      />
      <InspectorSection title="Data">
        <ChapterDataSelector
          sourceId={chapter.sourceId}
          sources={compatible}
          usageCount={
            chapter.sourceId ? (sourceUsage[chapter.sourceId] ?? 0) : 0
          }
          onSelect={(sourceId) => onChange({ ...chapter, sourceId })}
          onEditSource={onEditSource}
          onAddData={onAddData}
        />
      </InspectorSection>
      <InspectorSection
        title="Flyover path"
        description="Build the flight from views captured on the map."
      >
        <FlyoverPathEditor
          keyframes={chapter.keyframes}
          currentCamera={currentCamera ?? chapter.keyframes[0]}
          onChange={(keyframes) => onChange({ ...chapter, keyframes })}
          onPreviewCamera={onPreviewCamera}
        />
      </InspectorSection>
      <CollapsibleSection
        title="Reader behavior"
        summary={`${chapter.scrollLength} screen${chapter.scrollLength === 1 ? "" : "s"} per step`}
      >
        <FormField label="Scroll length">
          <NumberInput
            min={0.5}
            max={5}
            step={0.25}
            value={chapter.scrollLength}
            onChange={(event) =>
              onChange({
                ...chapter,
                scrollLength: Math.min(
                  5,
                  Math.max(0.5, Number(event.target.value)),
                ),
              })
            }
          />
        </FormField>
      </CollapsibleSection>
      <CollapsibleSection
        title="Overlays"
        summary={`${chapter.overlaySourceIds.length} overlay${chapter.overlaySourceIds.length === 1 ? "" : "s"}`}
      >
        <OverlayListEditor
          primarySourceId={chapter.sourceId}
          overlaySourceIds={chapter.overlaySourceIds}
          sources={compatible}
          onChange={(overlaySourceIds) =>
            onChange({ ...chapter, overlaySourceIds })
          }
          onEditSource={onEditSource}
          onAddData={onAddData}
        />
      </CollapsibleSection>
      <CollapsibleSection
        title="Map environment"
        summary={
          [
            first.globe ? "Globe" : null,
            first.terrain?.enabled ? "Terrain" : null,
            first.buildings ? "3D buildings" : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Flat map"
        }
      >
        <div className="chapter-editor-fields">
          <CheckboxField
            label="Globe"
            checked={first.globe ?? false}
            onChange={(event) =>
              onChange({
                ...chapter,
                keyframes: chapter.keyframes.map((frame) => ({
                  ...frame,
                  globe: event.target.checked,
                })),
              })
            }
          />
          <CheckboxField
            label="Terrain"
            checked={first.terrain?.enabled ?? false}
            onChange={(event) =>
              onChange({
                ...chapter,
                keyframes: chapter.keyframes.map((frame) => ({
                  ...frame,
                  terrain: {
                    enabled: event.target.checked,
                    exaggeration: frame.terrain?.exaggeration ?? 1,
                  },
                })),
              })
            }
          />
          <CheckboxField
            label="3D buildings"
            checked={first.buildings ?? false}
            onChange={(event) =>
              onChange({
                ...chapter,
                keyframes: chapter.keyframes.map((frame) => ({
                  ...frame,
                  buildings: event.target.checked,
                })),
              })
            }
          />
        </div>
      </CollapsibleSection>
    </div>
  );
}
