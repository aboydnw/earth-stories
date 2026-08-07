import type { ProjectSource } from "@earth-stories/story-schema";
import type { ImportedAsset, RemoteSourceDiscovery } from "./api";

export type ConnectableKind = Exclude<RemoteSourceDiscovery["kind"], "unknown">;

export function connectedSource(
  url: string,
  kind: ConnectableKind,
  discovery: RemoteSourceDiscovery | null,
): ProjectSource {
  const parsed = new URL(url);
  const common = {
    id: crypto.randomUUID(),
    label: parsed.hostname,
    locator: parsed.href,
    attribution: null,
    sizeBytes: discovery?.sizeBytes ?? null,
    delivery: "connected" as const,
  };
  const variable = discovery?.details.variables?.[0];
  const timeDimension =
    variable?.dimensions.find(
      (dimension) => dimension.toLowerCase() === "time",
    ) ?? null;
  if (kind === "pmtiles") return { ...common, kind, tileType: "vector" };
  if (kind === "zarr")
    return {
      ...common,
      kind,
      variable: variable?.name ?? "data",
      selection: {},
      timeDimension,
      timesteps: timeDimension ? [{ label: "First available", index: 0 }] : [],
      geozarr: null,
    };
  if (kind === "trajectory") return { ...common, kind, trailLength: 600 };
  if (kind === "copc")
    return { ...common, kind, colorMode: "elevation", pointSize: 2 };
  return { ...common, kind };
}

export function uploadedSource(
  file: File,
  uploaded: ImportedAsset,
): ProjectSource {
  const extension = uploaded.filename.split(".").pop()?.toLowerCase();
  const common = {
    id: crypto.randomUUID(),
    label: file.name,
    attribution: null,
    sizeBytes: uploaded.sizeBytes,
    delivery: "included" as const,
  };
  if (extension === "tif" || extension === "tiff")
    return { ...common, kind: "cog", locator: uploaded.path };
  if (extension === "geojson" || extension === "json")
    return { ...common, kind: "local-geojson", path: uploaded.path };
  if (extension === "pmtiles")
    return {
      ...common,
      kind: "pmtiles",
      locator: uploaded.path,
      tileType: "vector",
    };
  if (extension === "parquet")
    return { ...common, kind: "geoparquet", locator: uploaded.path };
  throw new Error(
    "Upload a GeoTIFF, GeoJSON, PMTiles, or GeoParquet file from the Data tab. Raw multidimensional and point-cloud files can still be prepared inside a story.",
  );
}
