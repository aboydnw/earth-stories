import {
  supportsTimeseriesChart,
  type ProjectChapter,
  type ProjectSource,
  type StoryProject,
} from "@earth-stories/story-schema";
import { validateRemoteUrl } from "./remote-url.js";

export interface DeterministicCompileIssue {
  code:
    | "missing-source"
    | "missing-overlay"
    | "incompatible-source"
    | "incompatible-overlay"
    | "invalid-source";
  message: string;
  chapterId?: string;
  resourceId?: string;
}

export function chapterCompileIssues(
  chapter: ProjectChapter,
  sources: Map<string, ProjectSource>,
): DeterministicCompileIssue[] {
  if (chapter.type === "prose" || chapter.type === "video") return [];
  const issues: DeterministicCompileIssue[] = [];
  if (chapter.type === "illustrated") {
    for (const layer of chapter.scene.layers) {
      if (layer.kind !== "image") continue;
      const source = sources.get(layer.sourceId);
      if (source?.kind === "image" && !/\.(png|jpe?g|webp)$/i.test(source.path))
        issues.push({
          code: "invalid-source",
          chapterId: chapter.id,
          resourceId: source.id,
          message: "Illustrated scenes require PNG, JPEG, or WebP artwork.",
        });
      if (!source || source.kind !== "image")
        issues.push({
          code: source ? "incompatible-source" : "missing-source",
          chapterId: chapter.id,
          resourceId: layer.sourceId,
          message: source
            ? `Illustration layer ${layer.id} requires an image source`
            : `Illustration layer ${layer.id} references missing source ${layer.sourceId}`,
        });
    }
    return issues;
  }
  if ("overlaySourceIds" in chapter) {
    for (const overlayId of chapter.overlaySourceIds ?? []) {
      const overlay = sources.get(overlayId);
      if (!overlay) {
        issues.push({
          code: "missing-overlay",
          chapterId: chapter.id,
          resourceId: overlayId,
          message: `Chapter "${chapter.title}" references missing overlay ${overlayId}`,
        });
      } else if (overlay.kind === "image" || overlay.kind === "csv") {
        issues.push({
          code: "incompatible-overlay",
          chapterId: chapter.id,
          resourceId: overlayId,
          message: `Chapter "${chapter.title}" requires geospatial overlays`,
        });
      }
    }
  }
  const sourceId = chapter.sourceId;
  if (!sourceId && chapter.type === "flyover") return issues;
  const source = sourceId ? sources.get(sourceId) : undefined;
  if (!source) {
    issues.push({
      code: "missing-source",
      chapterId: chapter.id,
      resourceId: sourceId ?? undefined,
      message: sourceId
        ? `Chapter "${chapter.title}" references missing source ${sourceId}`
        : `Chapter "${chapter.title}" has no source selected`,
    });
    return issues;
  }
  if (chapter.type === "image" && source.kind !== "image")
    issues.push({
      code: "incompatible-source",
      chapterId: chapter.id,
      resourceId: source.id,
      message: `Image chapter "${chapter.title}" requires an image source`,
    });
  if (chapter.type === "chart") {
    const kind = chapter.series.kind;
    const compatible =
      kind === "table"
        ? source.kind === "csv" &&
          chapter.xColumn !== "" &&
          chapter.yColumn !== ""
        : kind === "histogram"
          ? source.kind === "cog"
          : supportsTimeseriesChart(source);
    if (!compatible)
      issues.push({
        code: "incompatible-source",
        chapterId: chapter.id,
        resourceId: source.id,
        message:
          kind === "table"
            ? `Chart chapter "${chapter.title}" requires a CSV source with X and Y columns`
            : kind === "histogram"
              ? `Histogram chart "${chapter.title}" requires a COG source`
              : `Timeseries chart "${chapter.title}" requires a Zarr source with a time dimension, timesteps, and a spatial transform`,
      });
  }
  if (
    (chapter.type === "map" ||
      chapter.type === "scrolly" ||
      chapter.type === "flyover") &&
    (source.kind === "image" || source.kind === "csv")
  )
    issues.push({
      code: "incompatible-source",
      chapterId: chapter.id,
      resourceId: source.id,
      message: `${chapter.type[0]!.toUpperCase()}${chapter.type.slice(1)} chapter "${chapter.title}" requires a geospatial source`,
    });
  return issues;
}

export function sourceCompileIssue(
  source: ProjectSource,
): DeterministicCompileIssue | null {
  let message: string | null = null;
  if (
    (source.kind === "local-geojson" ||
      source.kind === "image" ||
      source.kind === "csv" ||
      (source.kind === "copc" && !/^https?:\/\//i.test(source.locator)) ||
      (source.kind === "trajectory" &&
        !/^https?:\/\//i.test(source.locator))) &&
    source.delivery === "connected"
  )
    message = `Local source "${source.label}" cannot use connected delivery`;
  else if (source.kind === "xyz" && source.delivery === "included")
    message = `XYZ source "${source.label}" cannot be included because it represents many remote tiles`;
  else if (source.kind === "zarr" && source.delivery === "included")
    message = `Zarr source "${source.label}" cannot be included yet because it is a multi-file store`;

  const locator =
    source.kind === "pmtiles" ||
    source.kind === "geoparquet" ||
    source.kind === "cog" ||
    source.kind === "xyz" ||
    source.kind === "zarr" ||
    source.kind === "trajectory" ||
    source.kind === "copc"
      ? source.locator
      : null;
  if (
    !message &&
    locator &&
    (source.kind === "zarr" || /^https?:\/\//i.test(locator))
  ) {
    try {
      validateRemoteUrl(locator);
    } catch (cause) {
      message =
        cause instanceof Error
          ? cause.message
          : "Remote assets must use a valid HTTP or HTTPS URL.";
    }
  }
  return message
    ? { code: "invalid-source", resourceId: source.id, message }
    : null;
}

export function projectCompileIssues(project: StoryProject) {
  const sources = new Map(project.sources.map((source) => [source.id, source]));
  return [
    ...project.chapters.flatMap((chapter) =>
      chapterCompileIssues(chapter, sources),
    ),
    ...[
      ...(project.visualSequences ?? []),
      ...(project.visualAccents ?? []),
    ].flatMap((v) =>
      chapterCompileIssues(
        {
          id: v.id,
          type: "illustrated",
          title: v.alt,
          narrative: "",
          alt: v.alt,
          caption: "",
          scene: v.scene,
        },
        sources,
      ),
    ),
    ...project.sources.flatMap((source) => {
      const issue = sourceCompileIssue(source);
      return issue ? [issue] : [];
    }),
  ];
}
