import type {
  PublicationManifest,
  StoryProject,
} from "@earth-stories/story-schema";
import { referencedSourceIds } from "./chapterSources.js";
import { compileProject } from "./compile.js";
import { projectCompileIssues } from "./compileValidation.js";
import { shareDescription } from "./share.js";

export type ReadinessArea =
  "story" | "chapters" | "data" | "preview" | "publish" | "sharing";
export type ReadinessSeverity = "error" | "warning" | "info";
export type ReadinessStageState =
  "complete" | "current" | "optional" | "blocked";

export interface ReadinessFinding {
  id: string;
  area: ReadinessArea;
  severity: ReadinessSeverity;
  message: string;
  resolution?: string;
  chapterId?: string;
  resourceId?: string;
}

export interface AuthoringReadiness {
  manifest: PublicationManifest | null;
  findings: ReadinessFinding[];
  stages: Record<ReadinessArea, ReadinessStageState>;
}

function ageInDays(value: string, now: Date): number | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor((now.getTime() - timestamp) / 86_400_000);
}

export function deriveAuthoringReadiness(
  project: StoryProject,
  options: { now?: Date } = {},
): AuthoringReadiness {
  const findings: ReadinessFinding[] = [];
  const sources = new Map(project.sources.map((source) => [source.id, source]));
  const sourceIds = new Set(sources.keys());

  if (!project.metadata.title.trim())
    findings.push({
      id: "story-title",
      area: "story",
      severity: "error",
      message: "The story has no title.",
      resolution: "Add a story title before previewing or publishing.",
    });
  if (!project.metadata.description.trim())
    findings.push({
      id: "story-description",
      area: "story",
      severity: "warning",
      message: "The story has no description.",
      resolution: "Add a short summary for readers and archive catalogs.",
    });

  for (const chapter of project.chapters) {
    if (!chapter.title.trim())
      findings.push({
        id: `chapter-title-${chapter.id}`,
        area: "chapters",
        severity: "error",
        chapterId: chapter.id,
        message: "A chapter has no title.",
        resolution: "Give every chapter a title.",
      });
    if (!chapter.narrative.trim())
      findings.push({
        id: `chapter-narrative-${chapter.id}`,
        area: "chapters",
        severity: "warning",
        chapterId: chapter.id,
        message: `“${chapter.title || "Untitled chapter"}” has no narrative.`,
        resolution: "Add context that explains what readers should notice.",
      });
    if (chapter.type === "image" && !chapter.alt.trim())
      findings.push({
        id: `image-alt-${chapter.id}`,
        area: "chapters",
        severity: "warning",
        chapterId: chapter.id,
        message: `“${chapter.title || "Untitled image"}” has no alternative text.`,
        resolution:
          "Describe the image for readers using assistive technology.",
      });
    if (
      (chapter.type === "chart" &&
        (!chapter.xColumn.trim() || !chapter.yColumn.trim())) ||
      (chapter.type === "video" &&
        (!chapter.videoId.trim() || chapter.videoId === "VIDEO_ID")) ||
      (chapter.type === "flyover" && chapter.keyframes.length < 2)
    )
      findings.push({
        id: `chapter-fields-${chapter.id}`,
        area: "chapters",
        severity: "error",
        chapterId: chapter.id,
        message: `“${chapter.title || "Untitled chapter"}” is missing required ${chapter.type} settings.`,
        resolution: "Complete the required chapter fields before previewing.",
      });
    for (const resourceId of referencedSourceIds(chapter)) {
      if (sourceIds.has(resourceId)) continue;
      findings.push({
        id: `chapter-source-${chapter.id}-${resourceId}`,
        area: "data",
        severity: "error",
        chapterId: chapter.id,
        resourceId,
        message: `“${chapter.title || "Untitled chapter"}” references data that is not available.`,
        resolution: "Choose an existing source or add the missing data.",
      });
    }
    if (
      (chapter.type === "map" ||
        chapter.type === "scrolly" ||
        chapter.type === "image" ||
        chapter.type === "chart") &&
      !chapter.sourceId.trim()
    )
      findings.push({
        id: `chapter-data-${chapter.id}`,
        area: "data",
        severity: "error",
        chapterId: chapter.id,
        message: `“${chapter.title || "Untitled chapter"}” needs a data source.`,
        resolution: "Add or connect data, then choose it for this chapter.",
      });
    if (chapter.type !== "prose" && chapter.type !== "video") {
      const primary = chapter.sourceId ? sources.get(chapter.sourceId) : null;
      const incompatible =
        primary &&
        ((chapter.type === "image" && primary.kind !== "image") ||
          (chapter.type === "chart" && primary.kind !== "csv") ||
          ((chapter.type === "map" ||
            chapter.type === "scrolly" ||
            chapter.type === "flyover") &&
            (primary.kind === "image" || primary.kind === "csv")));
      if (incompatible)
        findings.push({
          id: `chapter-source-kind-${chapter.id}`,
          area: "data",
          severity: "error",
          chapterId: chapter.id,
          resourceId: primary.id,
          message: `“${chapter.title || "Untitled chapter"}” cannot use ${primary.label} as its ${chapter.type} source.`,
          resolution: "Choose a compatible source for this visualization.",
        });
    }
  }

  const compileIssues = projectCompileIssues(project);
  for (const [index, issue] of compileIssues.entries()) {
    if (issue.code === "invalid-source")
      findings.push({
        id: `source-publication-${issue.resourceId}`,
        area: "data",
        severity: "error",
        resourceId: issue.resourceId,
        message: issue.message,
        resolution: "Choose a compatible publication delivery or source URL.",
      });
    else if (issue.code === "incompatible-overlay")
      findings.push({
        id: `chapter-overlay-kind-${issue.chapterId}-${issue.resourceId}`,
        area: "data",
        severity: "error",
        chapterId: issue.chapterId,
        resourceId: issue.resourceId,
        message: issue.message,
        resolution: "Choose a geospatial source for this overlay.",
      });
    else if (
      !["missing-source", "missing-overlay", "incompatible-source"].includes(
        issue.code,
      )
    )
      findings.push({
        id: `compile-${issue.code}-${issue.chapterId ?? issue.resourceId ?? index}`,
        area: issue.resourceId ? "data" : "preview",
        severity: "error",
        chapterId: issue.chapterId,
        resourceId: issue.resourceId,
        message: issue.message,
        resolution: "Repair the referenced chapter or source before exporting.",
      });
  }

  const now = options.now ?? new Date();
  for (const source of project.sources) {
    if (!source.attribution?.trim() && !source.provenance.publisher?.trim())
      findings.push({
        id: `provenance-owner-${source.id}`,
        area: "publish",
        severity: "warning",
        resourceId: source.id,
        message: `“${source.label}” has no attribution or publisher.`,
        resolution: "Identify the organization or person responsible for it.",
      });
    if (!source.provenance.dataUpdatedAt)
      findings.push({
        id: `provenance-updated-${source.id}`,
        area: "publish",
        severity: "warning",
        resourceId: source.id,
        message: `“${source.label}” has no data update date.`,
        resolution: "Add the date only when the source provides one.",
      });
    const age = source.provenance.dataUpdatedAt
      ? ageInDays(source.provenance.dataUpdatedAt, now)
      : null;
    if (
      age !== null &&
      source.provenance.staleAfterDays !== null &&
      age > source.provenance.staleAfterDays
    )
      findings.push({
        id: `provenance-stale-${source.id}`,
        area: "publish",
        severity: "warning",
        resourceId: source.id,
        message: `“${source.label}” is older than its ${source.provenance.staleAfterDays}-day freshness window.`,
        resolution:
          "Update the source or confirm that the older data is intentional.",
      });
  }

  if (!shareDescription(project))
    findings.push({
      id: "share-description",
      area: "sharing",
      severity: "warning",
      message: "A shared link will show no summary beneath its title.",
      resolution:
        "Add a story description, or narrative text to the first chapter.",
    });

  let manifest: PublicationManifest | null = null;
  if (compileIssues.length === 0) {
    try {
      manifest = compileProject(project);
    } catch (cause) {
      findings.push({
        id: "compile",
        area: "preview",
        severity: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "Project cannot be compiled.",
        resolution: "Repair the referenced chapter or source before exporting.",
      });
    }
  }

  const storyBlocked = findings.some(
    ({ area, severity }) => area === "story" && severity === "error",
  );
  const chaptersBlocked = findings.some(
    ({ area, severity }) => area === "chapters" && severity === "error",
  );
  const dataRequired = project.chapters.some(
    (chapter) =>
      chapter.type === "map" ||
      chapter.type === "scrolly" ||
      chapter.type === "image" ||
      chapter.type === "chart" ||
      (chapter.type === "flyover" && referencedSourceIds(chapter).length > 0),
  );
  const dataBlocked = findings.some(
    ({ area, severity }) => area === "data" && severity === "error",
  );
  const publishBlocked = findings.some(({ severity }) => severity === "error");
  const publishWarnings = findings.some(
    ({ severity }) => severity === "warning",
  );
  const sharingIncomplete = findings.some(
    ({ area, severity }) => area === "sharing" && severity !== "info",
  );

  return {
    manifest,
    findings,
    stages: {
      story: storyBlocked ? "current" : "complete",
      chapters: chaptersBlocked
        ? storyBlocked
          ? "blocked"
          : "current"
        : "complete",
      data: !dataRequired
        ? "optional"
        : dataBlocked
          ? storyBlocked || chaptersBlocked
            ? "blocked"
            : "current"
          : "complete",
      preview: manifest
        ? "complete"
        : storyBlocked || chaptersBlocked || dataBlocked
          ? "blocked"
          : "current",
      publish: publishBlocked
        ? "blocked"
        : publishWarnings
          ? "current"
          : "complete",
      sharing: publishBlocked
        ? "blocked"
        : sharingIncomplete
          ? "current"
          : "complete",
    },
  };
}
