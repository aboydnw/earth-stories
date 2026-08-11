import type {
  ProjectChapter,
  ProjectSource,
} from "@earth-stories/story-schema";
import {
  CollapsibleSection,
  FormField,
  InspectorSection,
  NumberInput,
  SelectInput,
  TextArea,
  TextInput,
} from "@earth-stories/ui";
import { ChapterDataSelector } from "../ChapterDataSelector";
import { ChapterContentSection } from "./ChapterContentSection";

type ChartChapter = Extract<ProjectChapter, { type: "chart" }>;
export function ChartChapterEditor({
  chapter,
  sources,
  sourceUsage,
  onChange,
  onEditSource,
  onAddData,
}: {
  chapter: ChartChapter;
  sources: ProjectSource[];
  sourceUsage: Record<string, number>;
  onChange: (next: ChartChapter) => void;
  onEditSource: (id: string) => void;
  onAddData: () => void;
}) {
  const tables = sources.filter(({ kind }) => kind === "csv");
  return (
    <div className="chapter-type-editor">
      <ChapterContentSection
        chapter={chapter}
        onChange={(next) => onChange(next as ChartChapter)}
      />
      <InspectorSection title="Data">
        <ChapterDataSelector
          sourceId={chapter.sourceId}
          sources={tables}
          usageCount={sourceUsage[chapter.sourceId] ?? 0}
          onSelect={(sourceId) => onChange({ ...chapter, sourceId })}
          onEditSource={onEditSource}
          onAddData={onAddData}
        />
      </InspectorSection>
      <InspectorSection
        title="Chart"
        description="Choose the main visual encoding."
      >
        <div className="chapter-editor-fields">
          <FormField label="Chart type">
            <SelectInput
              value={chapter.chartType}
              onChange={(event) =>
                onChange({
                  ...chapter,
                  chartType: event.target.value as "bar" | "line",
                })
              }
            >
              <option value="bar">Bar</option>
              <option value="line">Line</option>
            </SelectInput>
          </FormField>
          <FormField label="X column">
            <TextInput
              value={chapter.xColumn}
              onChange={(event) =>
                onChange({ ...chapter, xColumn: event.target.value })
              }
            />
          </FormField>
          <FormField label="Primary Y column">
            <TextInput
              value={chapter.yColumn}
              onChange={(event) =>
                onChange({ ...chapter, yColumn: event.target.value })
              }
            />
          </FormField>
          <FormField
            label="Additional Y columns"
            hint="Separate column names with commas."
          >
            <TextInput
              value={(chapter.yColumns ?? []).join(", ")}
              onChange={(event) =>
                onChange({
                  ...chapter,
                  yColumns: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
            />
          </FormField>
        </div>
      </InspectorSection>
      <CollapsibleSection
        title="Axes"
        summary={`${chapter.yScale ?? "linear"} scale`}
      >
        <div className="chapter-editor-fields">
          <FormField label="X axis label">
            <TextInput
              value={chapter.xLabel ?? ""}
              onChange={(event) =>
                onChange({ ...chapter, xLabel: event.target.value })
              }
            />
          </FormField>
          <FormField label="Y axis label">
            <TextInput
              value={chapter.yLabel ?? ""}
              onChange={(event) =>
                onChange({ ...chapter, yLabel: event.target.value })
              }
            />
          </FormField>
          <FormField label="Y scale">
            <SelectInput
              value={chapter.yScale ?? "linear"}
              onChange={(event) =>
                onChange({
                  ...chapter,
                  yScale: event.target.value as "linear" | "log",
                })
              }
            >
              <option value="linear">Linear</option>
              <option value="log">Logarithmic</option>
            </SelectInput>
          </FormField>
          <FormField label="Series column">
            <TextInput
              value={chapter.seriesColumn ?? ""}
              onChange={(event) =>
                onChange({
                  ...chapter,
                  seriesColumn: event.target.value || null,
                })
              }
            />
          </FormField>
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="Advanced range"
        summary={
          chapter.xMin == null && chapter.xMax == null
            ? "Automatic"
            : "Custom range"
        }
      >
        <div className="chapter-coordinate-grid">
          <FormField label="X minimum">
            <TextInput
              value={chapter.xMin ?? ""}
              onChange={(event) =>
                onChange({ ...chapter, xMin: event.target.value || null })
              }
            />
          </FormField>
          <FormField label="X maximum">
            <TextInput
              value={chapter.xMax ?? ""}
              onChange={(event) =>
                onChange({ ...chapter, xMax: event.target.value || null })
              }
            />
          </FormField>
        </div>
      </CollapsibleSection>
    </div>
  );
}
