import type { PublicationAsset } from "@earth-stories/story-schema";

export type FreshnessState = "current" | "stale" | "unknown";

export interface Freshness {
  state: FreshnessState;
  label: string;
}

export function formatProvenanceDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function sourceFreshness(
  asset: PublicationAsset,
  now: Date = new Date(),
): Freshness {
  const updated = asset.provenance.dataUpdatedAt;
  const windowDays = asset.provenance.staleAfterDays;
  if (!updated) return { state: "unknown", label: "Update date not provided" };
  if (windowDays === null)
    return {
      state: "unknown",
      label: `Updated ${formatProvenanceDate(updated)} · freshness policy not provided`,
    };
  const age = Math.floor((now.getTime() - Date.parse(updated)) / 86_400_000);
  if (!Number.isFinite(age))
    return { state: "unknown", label: "Update date is not valid" };
  return age > windowDays
    ? {
        state: "stale",
        label: `May be stale · updated ${formatProvenanceDate(updated)}`,
      }
    : {
        state: "current",
        label: `Current as of ${formatProvenanceDate(updated)}`,
      };
}

export function activeFilterDescriptions(asset: PublicationAsset): string[] {
  const presentation = asset.presentation;
  const descriptions: string[] = [];
  if (presentation.filterProperty && presentation.filterValue !== null)
    descriptions.push(
      `${presentation.filterProperty} = ${presentation.filterValue}`,
    );
  if (presentation.symbolProperty)
    descriptions.push(`Symbols grouped by ${presentation.symbolProperty}`);
  if (asset.kind === "cog") {
    descriptions.push(`Raster band ${presentation.rasterBand}`);
    if (presentation.rescale)
      descriptions.push(
        `Display range ${presentation.rescale[0]}–${presentation.rescale[1]}`,
      );
  }
  if (asset.kind === "zarr" && asset.zarr) {
    descriptions.push(`Variable ${asset.zarr.variable}`);
    for (const [dimension, index] of Object.entries(asset.zarr.selection))
      descriptions.push(`${dimension} index ${index}`);
  }
  if (asset.kind === "copc" && asset.copc)
    descriptions.push(`Point colors: ${asset.copc.colorMode}`);
  return descriptions;
}

export function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
