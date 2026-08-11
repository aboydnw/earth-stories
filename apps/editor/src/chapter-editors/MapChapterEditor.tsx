import type {
  ProjectChapter,
  ProjectSource,
} from "@earth-stories/story-schema";
import {
  CheckboxField,
  CollapsibleSection,
  FormField,
  InspectorSection,
  NumberInput,
  SelectInput,
} from "@earth-stories/ui";
import { ChapterDataSelector } from "../ChapterDataSelector";
import { OverlayListEditor } from "../OverlayListEditor";
import { ChapterContentSection } from "./ChapterContentSection";

type MapChapter = Extract<ProjectChapter, { type: "map" | "scrolly" }>;

export function MapChapterEditor({
  chapter,
  sources,
  sourceUsage,
  onChange,
  onEditSource,
  onAddData,
}: {
  chapter: MapChapter;
  sources: ProjectSource[];
  sourceUsage: Record<string, number>;
  onChange: (next: MapChapter) => void;
  onEditSource: (sourceId: string) => void;
  onAddData: () => void;
}) {
  const compatible = sources.filter(
    (source) => source.kind !== "image" && source.kind !== "csv",
  );
  const source = sources.find(({ id }) => id === chapter.sourceId);
  const overlays = chapter.overlaySourceIds ?? [];
  const updateCamera = (partial: Partial<MapChapter["camera"]>) =>
    onChange({ ...chapter, camera: { ...chapter.camera, ...partial } });
  return (
    <div className="chapter-type-editor chapter-type-editor--map">
      <ChapterContentSection
        chapter={chapter}
        onChange={(next) => onChange(next as MapChapter)}
      />
      <InspectorSection
        title="Data"
        description="The primary source shown in this chapter."
      >
        <ChapterDataSelector
          sourceId={chapter.sourceId}
          sources={compatible}
          usageCount={sourceUsage[chapter.sourceId] ?? 0}
          onSelect={(sourceId) => {
            const nextSource = sources.find(({ id }) => id === sourceId);
            const terrainUnsupported =
              nextSource?.kind === "cog" ||
              nextSource?.kind === "geoparquet" ||
              nextSource?.kind === "zarr" ||
              nextSource?.kind === "copc";
            onChange({
              ...chapter,
              sourceId,
              overlaySourceIds: overlays.filter((id) => id !== sourceId),
              camera: terrainUnsupported
                ? {
                    ...chapter.camera,
                    terrain: {
                      enabled: false,
                      exaggeration: chapter.camera.terrain?.exaggeration ?? 1,
                    },
                  }
                : chapter.camera,
            });
          }}
          onEditSource={onEditSource}
          onAddData={onAddData}
        />
      </InspectorSection>
      <CollapsibleSection
        title="Reader behavior"
        summary={
          chapter.type === "scrolly"
            ? `Guided map · ${chapter.overlayPosition ?? "left"} text`
            : "Standalone map"
        }
      >
        <div className="chapter-editor-fields">
          <FormField label="Transition">
            <SelectInput
              value={chapter.transition ?? "fly-to"}
              onChange={(event) =>
                onChange({
                  ...chapter,
                  transition: event.target.value as "fly-to" | "instant",
                })
              }
            >
              <option value="fly-to">Fly to view</option>
              <option value="instant">Switch instantly</option>
            </SelectInput>
          </FormField>
          {chapter.type === "scrolly" ? (
            <FormField label="Text position">
              <SelectInput
                value={chapter.overlayPosition ?? "left"}
                onChange={(event) =>
                  onChange({
                    ...chapter,
                    overlayPosition: event.target.value as "left" | "right",
                  })
                }
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </SelectInput>
            </FormField>
          ) : null}
          {source?.kind === "zarr" || source?.kind === "trajectory" ? (
            <FormField
              label="Chapter time"
              hint="Position within the source timeline."
            >
              <NumberInput
                min={0}
                max={1}
                step={0.01}
                value={chapter.temporalPosition ?? 0}
                onChange={(event) =>
                  onChange({
                    ...chapter,
                    temporalPosition: Number(event.target.value),
                  })
                }
              />
            </FormField>
          ) : null}
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="Layers"
        summary={`${overlays.length} overlay${overlays.length === 1 ? "" : "s"}`}
      >
        <OverlayListEditor
          primarySourceId={chapter.sourceId}
          overlaySourceIds={overlays}
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
            chapter.camera.globe ? "Globe" : null,
            chapter.camera.terrain?.enabled ? "Terrain" : null,
            chapter.camera.buildings ? "3D buildings" : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Flat map"
        }
      >
        <div className="chapter-editor-fields">
          <CheckboxField
            label="Globe"
            checked={chapter.camera.globe ?? false}
            onChange={(event) => updateCamera({ globe: event.target.checked })}
          />
          <CheckboxField
            label="Terrain"
            checked={chapter.camera.terrain?.enabled ?? false}
            onChange={(event) =>
              updateCamera({
                terrain: {
                  enabled: event.target.checked,
                  exaggeration: chapter.camera.terrain?.exaggeration ?? 1,
                },
              })
            }
          />
          {chapter.camera.terrain?.enabled ? (
            <FormField label="Terrain exaggeration">
              <NumberInput
                min={0}
                max={10}
                step={0.1}
                value={chapter.camera.terrain.exaggeration}
                onChange={(event) =>
                  updateCamera({
                    terrain: {
                      enabled: true,
                      exaggeration: Number(event.target.value),
                    },
                  })
                }
              />
            </FormField>
          ) : null}
          <CheckboxField
            label="3D buildings"
            checked={chapter.camera.buildings ?? false}
            onChange={(event) =>
              updateCamera({ buildings: event.target.checked })
            }
          />
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="Exact coordinates"
        summary={`Zoom ${chapter.camera.zoom.toFixed(1)} · Pitch ${Math.round(chapter.camera.pitch)}°`}
      >
        <div className="chapter-coordinate-grid">
          <CameraNumber
            label="Longitude"
            value={chapter.camera.center[0]}
            onChange={(value) =>
              updateCamera({ center: [value, chapter.camera.center[1]] })
            }
          />
          <CameraNumber
            label="Latitude"
            value={chapter.camera.center[1]}
            onChange={(value) =>
              updateCamera({ center: [chapter.camera.center[0], value] })
            }
          />
          <CameraNumber
            label="Zoom"
            value={chapter.camera.zoom}
            onChange={(zoom) => updateCamera({ zoom })}
          />
          <CameraNumber
            label="Bearing"
            value={chapter.camera.bearing}
            onChange={(bearing) => updateCamera({ bearing })}
          />
          <CameraNumber
            label="Pitch"
            value={chapter.camera.pitch}
            onChange={(pitch) => updateCamera({ pitch })}
          />
        </div>
      </CollapsibleSection>
    </div>
  );
}

function CameraNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <FormField label={label}>
      <NumberInput
        step="any"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </FormField>
  );
}
