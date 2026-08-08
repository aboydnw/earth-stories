import type { SourceProvenance } from "@earth-stories/story-schema";
import {
  CollapsibleSection,
  FormField,
  NumberInput,
  TextArea,
  TextInput,
} from "@earth-stories/ui";

function validHttp(value: string | null): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validIso(value: string | null): boolean {
  if (!value) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month, day);
  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month &&
    calendarDate.getUTCDate() === day
  );
}

export function SourceProvenanceFields({
  value,
  onChange,
}: {
  value: SourceProvenance;
  onChange: (value: SourceProvenance) => void;
}) {
  const update = <Key extends keyof SourceProvenance>(
    key: Key,
    next: SourceProvenance[Key],
  ) => onChange({ ...value, [key]: next });
  return (
    <div className="source-provenance-fields">
      <CollapsibleSection title="Source and provenance">
        <div className="source-provenance-fields__grid">
          <FormField
            label="Publisher"
            hint="Organization or person responsible for the source."
          >
            <TextInput
              value={value.publisher ?? ""}
              onChange={(event) =>
                update("publisher", event.target.value || null)
              }
            />
          </FormField>
          <FormField
            label="Source URL"
            error={
              validHttp(value.sourceUrl)
                ? undefined
                : "Use an HTTP or HTTPS URL."
            }
          >
            <TextInput
              type="url"
              value={value.sourceUrl ?? ""}
              onChange={(event) =>
                update("sourceUrl", event.target.value || null)
              }
            />
          </FormField>
          <FormField label="License name">
            <TextInput
              value={value.licenseName ?? ""}
              onChange={(event) =>
                update("licenseName", event.target.value || null)
              }
            />
          </FormField>
          <FormField
            label="License URL"
            error={
              validHttp(value.licenseUrl)
                ? undefined
                : "Use an HTTP or HTTPS URL."
            }
          >
            <TextInput
              type="url"
              value={value.licenseUrl ?? ""}
              onChange={(event) =>
                update("licenseUrl", event.target.value || null)
              }
            />
          </FormField>
          <FormField
            label="Data updated"
            hint="ISO date or datetime supplied by the source."
            error={
              validIso(value.dataUpdatedAt)
                ? undefined
                : "Use an ISO date such as 2026-08-08."
            }
          >
            <TextInput
              value={value.dataUpdatedAt ?? ""}
              placeholder="YYYY-MM-DD"
              onChange={(event) =>
                update("dataUpdatedAt", event.target.value || null)
              }
            />
          </FormField>
          <FormField
            label="Accessed"
            hint="When you retrieved or connected this source."
            error={
              validIso(value.accessedAt)
                ? undefined
                : "Use an ISO date such as 2026-08-08."
            }
          >
            <TextInput
              value={value.accessedAt ?? ""}
              placeholder="YYYY-MM-DD"
              onChange={(event) =>
                update("accessedAt", event.target.value || null)
              }
            />
          </FormField>
          <FormField
            label="Freshness window (days)"
            hint="Leave empty unless the source has an explicit policy."
          >
            <NumberInput
              min={0}
              step={1}
              value={value.staleAfterDays ?? ""}
              onChange={(event) =>
                update(
                  "staleAfterDays",
                  event.target.value === ""
                    ? null
                    : Math.max(0, Number.parseInt(event.target.value, 10)),
                )
              }
            />
          </FormField>
          <FormField
            label="Spatial coverage"
            hint="Reader-facing place or extent label."
          >
            <TextInput
              value={value.spatialCoverage ?? ""}
              onChange={(event) =>
                update("spatialCoverage", event.target.value || null)
              }
            />
          </FormField>
          <FormField label="Temporal coverage start">
            <TextInput
              value={value.temporalCoverage?.start ?? ""}
              placeholder="YYYY-MM-DD"
              onChange={(event) =>
                update("temporalCoverage", {
                  start: event.target.value || null,
                  end: value.temporalCoverage?.end ?? null,
                })
              }
            />
          </FormField>
          <FormField label="Temporal coverage end">
            <TextInput
              value={value.temporalCoverage?.end ?? ""}
              placeholder="YYYY-MM-DD"
              onChange={(event) =>
                update("temporalCoverage", {
                  start: value.temporalCoverage?.start ?? null,
                  end: event.target.value || null,
                })
              }
            />
          </FormField>
        </div>
        <FormField
          label="Transformations"
          hint="One plain-language step per line, in the order applied."
        >
          <TextArea
            rows={4}
            value={value.transformations.join("\n")}
            onChange={(event) =>
              update(
                "transformations",
                event.target.value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
              )
            }
          />
        </FormField>
      </CollapsibleSection>
    </div>
  );
}
