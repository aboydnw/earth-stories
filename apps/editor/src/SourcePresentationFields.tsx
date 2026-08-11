import { useEffect, useState } from "react";
import type { ProjectSource } from "@earth-stories/story-schema";
import {
  CheckboxField,
  CollapsibleSection,
  FormField,
  NumberInput,
  SelectInput,
  TextInput,
} from "@earth-stories/ui";

const defaults = {
  opacity: 0.85,
  color: "#cf3f02",
  strokeColor: "#443f3f",
  radius: 6,
  sourceLayer: null,
  rasterBand: 1,
  rescale: null,
  colormap: "viridis" as const,
  legendTitle: "",
  legendVisible: true,
  symbolProperty: null,
  categoryColors: {} as Record<string, string>,
  filterProperty: null,
  filterValue: null,
};

export function SourcePresentationFields({
  source,
  onChange,
}: {
  source: ProjectSource;
  onChange: (next: ProjectSource) => void;
}) {
  const value = { ...defaults, ...source.presentation };
  const update = (partial: Partial<typeof value>) =>
    onChange({ ...source, presentation: { ...value, ...partial } });
  const [categoryDraft, setCategoryDraft] = useState(() =>
    Object.entries(value.categoryColors)
      .map(([key, color]) => `${key}=${color}`)
      .join(", "),
  );
  const [categoryError, setCategoryError] = useState<string | null>(null);
  useEffect(() => {
    setCategoryDraft(
      Object.entries(value.categoryColors)
        .map(([key, color]) => `${key}=${color}`)
        .join(", "),
    );
    setCategoryError(null);
  }, [source.id]);
  return (
    <>
      <CollapsibleSection
        title="Map appearance"
        summary={`${Math.round(value.opacity * 100)}% opacity · ${value.colormap}`}
      >
        <div className="chapter-editor-fields">
          <FormField label="Opacity">
            <NumberInput
              min={0}
              max={1}
              step={0.05}
              value={value.opacity}
              onChange={(event) =>
                update({ opacity: Number(event.target.value) })
              }
            />
          </FormField>
          <FormField label="Fill color">
            <TextInput
              type="color"
              value={value.color}
              onChange={(event) => update({ color: event.target.value })}
            />
          </FormField>
          <FormField label="Stroke color">
            <TextInput
              type="color"
              value={value.strokeColor}
              onChange={(event) => update({ strokeColor: event.target.value })}
            />
          </FormField>
          <FormField label="Point radius">
            <NumberInput
              min={1}
              max={40}
              value={value.radius}
              onChange={(event) =>
                update({ radius: Number(event.target.value) })
              }
            />
          </FormField>
          {source.kind === "cog" || source.kind === "zarr" ? (
            <FormField label="Colormap">
              <SelectInput
                value={value.colormap}
                onChange={(event) =>
                  update({
                    colormap: event.target.value as typeof value.colormap,
                  })
                }
              >
                <option value="viridis">Viridis</option>
                <option value="magma">Magma</option>
                <option value="terrain">Terrain</option>
                <option value="grayscale">Grayscale</option>
              </SelectInput>
            </FormField>
          ) : null}
          {source.kind === "pmtiles" && source.tileType === "vector" ? (
            <FormField label="Source layer">
              <TextInput
                value={value.sourceLayer ?? ""}
                onChange={(event) =>
                  update({ sourceLayer: event.target.value || null })
                }
              />
            </FormField>
          ) : null}
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="Filtering and legend"
        summary={
          value.legendVisible
            ? value.legendTitle || "Legend visible"
            : "Legend hidden"
        }
      >
        <div className="chapter-editor-fields">
          <FormField label="Filter property">
            <TextInput
              value={value.filterProperty ?? ""}
              onChange={(event) =>
                update({ filterProperty: event.target.value || null })
              }
            />
          </FormField>
          <FormField label="Filter value">
            <TextInput
              value={value.filterValue ?? ""}
              onChange={(event) =>
                update({ filterValue: event.target.value || null })
              }
            />
          </FormField>
          <FormField label="Legend title">
            <TextInput
              value={value.legendTitle}
              onChange={(event) => update({ legendTitle: event.target.value })}
            />
          </FormField>
          <CheckboxField
            label="Show legend"
            checked={value.legendVisible}
            onChange={(event) =>
              update({ legendVisible: event.target.checked })
            }
          />
          <FormField
            label="Category colors"
            hint="Use value=#rrggbb pairs separated by commas."
            error={categoryError}
          >
            <TextInput
              value={categoryDraft}
              onChange={(event) => {
                const draft = event.target.value;
                setCategoryDraft(draft);
                const entries = draft.trim()
                  ? draft.split(",").map((part) => part.trim().split("="))
                  : [];
                if (
                  entries.some(
                    (entry) =>
                      entry.length !== 2 ||
                      !entry[0] ||
                      !entry[1] ||
                      !/^#[0-9a-f]{6}$/i.test(entry[1]),
                  )
                ) {
                  setCategoryError("Use value=#rrggbb pairs.");
                  return;
                }
                setCategoryError(null);
                update({
                  categoryColors: Object.fromEntries(
                    entries as [string, string][],
                  ),
                });
              }}
            />
          </FormField>
        </div>
      </CollapsibleSection>
    </>
  );
}
