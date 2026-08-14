import type {
  PublicationManifest,
  ProjectSource,
  StoryProject,
} from "@earth-stories/story-schema";
import type { ReadinessFinding } from "@earth-stories/publisher/readiness";

export function previewReadinessError(
  findings: ReadonlyArray<ReadinessFinding>,
): string | null {
  return findings.find(({ severity }) => severity === "error")?.message ?? null;
}

function sourcePath(source: ProjectSource) {
  if (
    source.kind === "local-geojson" ||
    source.kind === "image" ||
    source.kind === "csv"
  )
    return source.path;
  if (
    source.kind === "pmtiles" ||
    source.kind === "geoparquet" ||
    source.kind === "cog" ||
    source.kind === "trajectory" ||
    source.kind === "copc"
  )
    return source.locator;
  return null;
}

export function resolvePreviewManifest(
  project: StoryProject,
  manifest: PublicationManifest,
): PublicationManifest {
  const sources = new Map(project.sources.map((source) => [source.id, source]));
  return {
    ...manifest,
    assets: manifest.assets.map((asset) => {
      const source = sources.get(asset.id);
      if (!source) return asset;
      const path = sourcePath(source);
      if (
        asset.delivery === "connected" &&
        source.kind !== "zarr" &&
        source.kind !== "xyz"
      )
        return {
          ...asset,
          href: `/api/projects/${encodeURIComponent(project.id)}/sources/${encodeURIComponent(source.id)}/content`,
        };
      if (asset.delivery !== "included" || !path) return asset;
      const pathSegments = path.split("/");
      if (
        !/^https?:\/\//i.test(path) &&
        pathSegments.some((segment) => segment === "." || segment === "..")
      )
        throw new Error(
          `Source "${source.label}" contains a path traversal segment.`,
        );
      return {
        ...asset,
        href: /^https?:\/\//i.test(path)
          ? path
          : `/api/projects/${encodeURIComponent(project.id)}/assets/${path
              .split("/")
              .map(encodeURIComponent)
              .join("/")}`,
      };
    }),
  };
}
