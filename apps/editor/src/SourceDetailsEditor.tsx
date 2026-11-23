import {
  createDefaultSourceProvenance,
  type ProjectSource,
} from "@earth-stories/story-schema";
import {
  ActionButton,
  CollapsibleSection,
  FormField,
  InspectorSection,
  SelectInput,
  StatusNotice,
  TextInput,
} from "@earth-stories/ui";
import {
  DEFAULT_PRESENTATION,
  SourcePresentationFields,
} from "./SourcePresentationFields";
import { SourceProvenanceFields } from "./SourceProvenanceFields";

const LEGACY_REGIONS_URL =
  "https://pub-a8e1027739334149a1dadd24c89b6969.r2.dev/context/admin1.pmtiles";
const GEOHUB_REGIONS_URL =
  "https://undpngddlsgeohubdev01.blob.core.windows.net/admin/cgaz/ADM1.pmtiles";

export function SourceDetailsEditor({
  source,
  chapterTitles,
  onChange,
  onClose,
}: {
  source: ProjectSource;
  chapterTitles: string[];
  onChange: (next: ProjectSource) => void;
  onClose: () => void;
}) {
  const legacyRegions =
    source.kind === "pmtiles" &&
    source.delivery === "connected" &&
    source.tileType === "vector" &&
    source.locator === LEGACY_REGIONS_URL
      ? source
      : null;
  return (
    <section
      className="source-details-editor"
      aria-label={`Shared source settings for ${source.label}`}
    >
      <header className="source-details-editor__heading">
        <div>
          <p>Shared source</p>
          <h3>{source.label}</h3>
        </div>
        <button type="button" onClick={onClose}>
          Back to data library
        </button>
      </header>
      <StatusNotice tone="info">
        <strong>Affects every chapter using this source.</strong>
        {chapterTitles.length ? (
          <span>
            {" "}
            Used by{" "}
            {chapterTitles.map((title, index) => (
              <span key={`${title}-${index}`}>
                {title}
                {index < chapterTitles.length - 1 ? ", " : ""}
              </span>
            ))}
            .
          </span>
        ) : (
          <span> This source is not currently used by a chapter.</span>
        )}
      </StatusNotice>
      {legacyRegions ? (
        <div>
          <StatusNotice tone="warning">
            The old regions archive returned “not found.” You can switch to the
            UNDP GeoHub release of geoBoundaries CGAZ, which may have newer
            boundaries. This updates the link, tile layer and provenance in
            every chapter that uses this source. Review and save when ready.
          </StatusNotice>
          <ActionButton
            type="button"
            variant="surface"
            onClick={() =>
              onChange({
                ...legacyRegions,
                locator: GEOHUB_REGIONS_URL,
                attribution:
                  "geoBoundaries CGAZ, CC BY 4.0; hosted by UNDP GeoHub",
                sizeBytes: null,
                provenance: {
                  ...createDefaultSourceProvenance(),
                  publisher: "UNDP GeoHub",
                  sourceUrl:
                    "https://dev.undpgeohub.org/data/bff5f75bf76fa5e75296c9c79cdf0755",
                  licenseName: "CC BY 4.0",
                  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
                  staleAfterDays: legacyRegions.provenance.staleAfterDays,
                },
                presentation: {
                  ...DEFAULT_PRESENTATION,
                  ...legacyRegions.presentation,
                  sourceLayer: "admin",
                },
              })
            }
          >
            Switch to UNDP GeoHub
          </ActionButton>
        </div>
      ) : null}
      <InspectorSection title="Source identity">
        <div className="chapter-editor-fields">
          <FormField label="Source label">
            <TextInput
              value={source.label}
              onChange={(event) =>
                onChange({ ...source, label: event.target.value })
              }
            />
          </FormField>
          <FormField label="Attribution">
            <TextInput
              value={source.attribution ?? ""}
              onChange={(event) =>
                onChange({ ...source, attribution: event.target.value || null })
              }
            />
          </FormField>
        </div>
      </InspectorSection>
      <CollapsibleSection
        title="Publication delivery"
        summary={source.delivery}
      >
        <FormField label="Delivery policy">
          <SelectInput
            value={source.delivery}
            onChange={(event) =>
              onChange({
                ...source,
                delivery: event.target.value as
                  "auto" | "included" | "connected",
              })
            }
          >
            <option value="auto">Automatic</option>
            <option value="included">Include with publication</option>
            <option value="connected">Keep connected</option>
          </SelectInput>
        </FormField>
      </CollapsibleSection>
      <CollapsibleSection title="Data interpretation" summary={source.kind}>
        <div className="chapter-editor-fields">
          {"locator" in source ? (
            <FormField label="Source location">
              <TextInput
                value={source.locator}
                onChange={(event) =>
                  onChange({ ...source, locator: event.target.value })
                }
              />
            </FormField>
          ) : null}
          {source.kind === "pmtiles" ? (
            <FormField label="PMTiles content">
              <SelectInput
                value={source.tileType}
                onChange={(event) =>
                  onChange({
                    ...source,
                    tileType: event.target.value as "vector" | "raster",
                  })
                }
              >
                <option value="vector">Vector tiles</option>
                <option value="raster">Raster tiles</option>
              </SelectInput>
            </FormField>
          ) : null}
          {source.kind === "zarr" ? (
            <FormField label="Variable">
              <TextInput
                value={source.variable}
                onChange={(event) =>
                  onChange({ ...source, variable: event.target.value })
                }
              />
            </FormField>
          ) : null}
          {source.kind === "trajectory" ? (
            <FormField label="Trail length">
              <TextInput
                type="number"
                value={source.trailLength}
                onChange={(event) =>
                  onChange({
                    ...source,
                    trailLength: Number(event.target.value),
                  })
                }
              />
            </FormField>
          ) : null}
          {source.kind === "copc" ? (
            <FormField label="Point color">
              <SelectInput
                value={source.colorMode}
                onChange={(event) =>
                  onChange({
                    ...source,
                    colorMode: event.target.value as typeof source.colorMode,
                  })
                }
              >
                <option value="elevation">Elevation</option>
                <option value="intensity">Intensity</option>
                <option value="classification">Classification</option>
                <option value="rgb">RGB</option>
              </SelectInput>
            </FormField>
          ) : null}
        </div>
      </CollapsibleSection>
      {source.kind !== "image" && source.kind !== "csv" ? (
        <SourcePresentationFields source={source} onChange={onChange} />
      ) : null}
      <SourceProvenanceFields
        value={source.provenance}
        onChange={(provenance) => onChange({ ...source, provenance })}
      />
    </section>
  );
}
