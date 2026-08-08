import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  PublicationManifest,
  StoryProject,
} from "@earth-stories/story-schema";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { containedRealPath } from "./paths.js";
import { authorizedFetch } from "./remote-fetch.js";
import {
  deriveAuthoringReadiness,
  type ReadinessArea,
  type ReadinessSeverity,
} from "./readiness.js";

export type PreflightSeverity = ReadinessSeverity;
export interface PreflightIssue {
  id: string;
  area: ReadinessArea;
  severity: PreflightSeverity;
  message: string;
  resolution?: string;
  chapterId?: string;
  resourceId?: string;
}
export interface PublicationPreflight {
  ready: boolean;
  projectId: string;
  buildId: string | null;
  estimatedIncludedBytes: number;
  includedAssets: number;
  connectedAssets: number;
  profile: StoryProject["publication"]["profile"];
  issues: PreflightIssue[];
  manifest: PublicationManifest | null;
}

function localLocator(source: StoryProject["sources"][number]): string | null {
  return source.kind === "local-geojson" ||
    source.kind === "image" ||
    source.kind === "csv"
    ? source.path
    : source.kind === "pmtiles" ||
        source.kind === "geoparquet" ||
        source.kind === "cog" ||
        source.kind === "trajectory" ||
        source.kind === "copc"
      ? source.locator
      : null;
}
export async function preflightPublication(
  projectDirectory: string,
): Promise<PublicationPreflight> {
  const raw = JSON.parse(
    await readFile(join(projectDirectory, "story.json"), "utf8"),
  ) as unknown;
  const project = storyProjectSchema.parse(raw);
  const localReadiness = deriveAuthoringReadiness(project);
  const issues: PreflightIssue[] = [...localReadiness.findings];
  const manifest: PublicationManifest | null = localReadiness.manifest;
  for (const chapter of project.chapters) {
    if (
      chapter.type === "map" ||
      chapter.type === "scrolly" ||
      chapter.type === "flyover"
    )
      issues.push({
        id: `archive-snapshot-${chapter.id}`,
        area: "publish",
        severity: "info",
        chapterId: chapter.id,
        message: `The archival export will preserve “${chapter.title}” as a map snapshot.`,
      });
  }
  let estimatedIncludedBytes = 0;
  for (const source of project.sources) {
    const asset = manifest?.assets.find(
      (candidate) => candidate.id === source.id,
    );
    if (asset?.delivery === "connected") {
      let safe = false;
      try {
        const parsed = new URL(asset.href);
        safe = parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        /* Report below. */
      }
      issues.push(
        safe
          ? {
              id: `connected-${source.id}`,
              area: "publish",
              severity: "warning",
              resourceId: source.id,
              message: `“${source.label}” remains connected to ${asset.href}.`,
              resolution:
                "Confirm the URL permits CORS and stays publicly available.",
            }
          : {
              id: `unsafe-url-${source.id}`,
              area: "data",
              severity: "error",
              resourceId: source.id,
              message: `“${source.label}” does not use a valid HTTP or HTTPS URL.`,
            },
      );
      continue;
    }
    const remoteLocator =
      source.kind === "cog" ||
      source.kind === "pmtiles" ||
      source.kind === "geoparquet" ||
      source.kind === "trajectory" ||
      source.kind === "copc"
        ? source.locator
        : null;
    if (remoteLocator && /^https?:\/\//i.test(remoteLocator)) {
      let reportedSize = source.sizeBytes;
      try {
        let response = await authorizedFetch(remoteLocator, {
          method: "HEAD",
          signal: AbortSignal.timeout(15_000),
        });
        if (response.status === 403 || response.status === 405)
          response = await authorizedFetch(remoteLocator, {
            headers: { range: "bytes=0-0" },
            signal: AbortSignal.timeout(15_000),
          });
        if (!response.ok)
          throw new Error(`remote server returned ${response.status}`);
        const contentRange = response.headers.get("content-range");
        const contentLength = response.headers.get("content-length");
        const reportedLength = contentRange?.match(/\/(\d+)$/)?.[1];
        const length = Number(reportedLength ?? contentLength);
        if (
          (reportedLength !== undefined || contentLength !== null) &&
          Number.isFinite(length) &&
          length >= 0
        )
          reportedSize = length;
        if (reportedSize !== null) estimatedIncludedBytes += reportedSize;
        else
          issues.push({
            id: `unknown-size-${source.id}`,
            area: "publish",
            severity: "warning",
            resourceId: source.id,
            message: `The portable size of “${source.label}” is unknown.`,
            resolution:
              "Confirm there is enough disk space before building this release.",
          });
      } catch (cause) {
        issues.push({
          id: `unreachable-${source.id}`,
          area: "data",
          severity: "error",
          resourceId: source.id,
          message: `Earth Stories could not reach “${source.label}” for portable inclusion.`,
          resolution:
            cause instanceof Error
              ? cause.message
              : "Check the source URL and try again.",
        });
      }
      continue;
    }
    const locator = localLocator(source);
    if (!locator) continue;
    try {
      const candidate = await containedRealPath(
        projectDirectory,
        locator,
        `“${source.label}” points outside the project folder.`,
      );
      await access(candidate);
      const details = await stat(candidate);
      if (!details.isFile()) throw new Error("not a file");
      estimatedIncludedBytes += details.size;
    } catch (cause) {
      const escaped =
        cause instanceof Error && cause.message.includes("outside the project");
      issues.push({
        id: `${escaped ? "escape" : "missing"}-${source.id}`,
        area: "data",
        severity: "error",
        resourceId: source.id,
        message: escaped
          ? cause.message
          : `The local file for “${source.label}” is missing.`,
        resolution: escaped
          ? undefined
          : "Restore or replace the asset before exporting.",
      });
    }
  }
  if (manifest?.externalDependencies.length)
    issues.push({
      id: "network",
      area: "publish",
      severity: "info",
      message: `${manifest.externalDependencies.length} external resource${manifest.externalDependencies.length === 1 ? " is" : "s are"} required by the interactive publication.`,
    });
  if (manifest?.hostingRequirements.includes("byte-ranges"))
    issues.push({
      id: "hosting-byte-ranges",
      area: "publish",
      severity: "info",
      message:
        "This publication contains browser-streamed geospatial data and needs a static host that supports HTTP byte-range requests.",
    });
  if (
    project.publication.profile === "portable" &&
    Boolean(manifest?.externalDependencies.length)
  )
    issues.push({
      id: "portable-connected-exceptions",
      area: "publish",
      severity: "warning",
      message:
        "This portable release still has connected exceptions, such as its basemap or XYZ tiles.",
      resolution:
        "Review the dependency report. Earth Stories does not claim offline support yet.",
    });
  const deduplicated = [
    ...new Map(issues.map((issue) => [issue.id, issue])).values(),
  ];
  return {
    ready: !deduplicated.some((issue) => issue.severity === "error"),
    projectId: project.id,
    profile: project.publication.profile,
    buildId: manifest?.build.id ?? null,
    estimatedIncludedBytes,
    includedAssets:
      manifest?.assets.filter((asset) => asset.delivery === "included")
        .length ?? 0,
    connectedAssets:
      manifest?.assets.filter((asset) => asset.delivery === "connected")
        .length ?? 0,
    issues: deduplicated,
    manifest,
  };
}
