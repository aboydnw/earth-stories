import type {
  ChartSeries,
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
  const kind = chapter.series.kind;
  const compatible = sources.filter((source) =>
    kind === "table"
      ? source.kind === "csv"
      : kind === "histogram"
        ? source.kind === "cog"
        : source.kind === "zarr" && source.timeDimension !== null,
  );
  return (
    <div className="chapter-type-editor">
      <ChapterContentSection
        chapter={chapter}
        onChange={(next) => onChange(next as ChartChapter)}
      />
      <InspectorSection title="Data">
        <ChapterDataSelector
          sourceId={chapter.sourceId}
          sources={compatible}
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
          <FormField label="Chart source" hint="Where the numbers come from.">
            <SelectInput
              value={kind}
              onChange={(event) => {
                const next = event.target.value as ChartSeries["kind"];
                onChange({
                  ...chapter,
                  sourceId: "",
                  series:
                    next === "histogram"
                      ? { kind: "histogram", bins: 20 }
                      : next === "timeseries"
                        ? { kind: "timeseries", point: [0, 0] }
                        : { kind: "table" },
                });
              }}
            >
              <option value="table">CSV table</option>
              <option value="histogram">Raster value distribution</option>
              <option value="timeseries">Value over time at a point</option>
            </SelectInput>
          </FormField>
          {chapter.series.kind === "histogram" ? (
            <FormField label="Bins" hint="Between 2 and 256.">
              <NumberInput
                min={2}
                max={256}
                value={chapter.series.bins}
                onChange={(event) =>
                  onChange({
                    ...chapter,
                    series: {
                      kind: "histogram",
                      bins: Number(event.target.value),
                    },
                  })
                }
              />
            </FormField>
          ) : null}
          {chapter.series.kind === "timeseries" ? (
            <>
              <FormField label="Longitude">
                <NumberInput
                  value={chapter.series.point[0]}
                  onChange={(event) =>
                    onChange({
                      ...chapter,
                      series: {
                        kind: "timeseries",
                        point: [
                          Number(event.target.value),
                          (chapter.series as { point: [number, number] })
                            .point[1],
                        ],
                      },
                    })
                  }
                />
              </FormField>
              <FormField label="Latitude">
                <NumberInput
                  value={chapter.series.point[1]}
                  onChange={(event) =>
                    onChange({
                      ...chapter,
                      series: {
                        kind: "timeseries",
                        point: [
                          (chapter.series as { point: [number, number] })
                            .point[0],
                          Number(event.target.value),
                        ],
                      },
                    })
                  }
                />
              </FormField>
            </>
          ) : null}
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
          {kind === "table" ? (
            <>
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
            </>
          ) : null}
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
