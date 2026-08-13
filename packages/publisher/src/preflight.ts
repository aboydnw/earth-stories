import { access, readFile, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import type {
  PublicationManifest,
  StoryProject,
} from "@earth-stories/story-schema";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { containedRealPath } from "./paths.js";
import { authorizedFetch } from "./remote-fetch.js";
import { inventoryPublicationDependencies } from "./dependencies.js";
import { findVerifiedRemoteMaterialization } from "./materialize.js";
import { isValidPng, SHARE_CARD_SOURCE_FILENAME } from "./share.js";
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
  requiredDownloadBytes: number;
  unknownDownloadSizes: number;
  availableDiskBytes: number | null;
  needsBuildInternet: boolean;
  needsRuntimeInternet: boolean;
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
  const inventory = inventoryPublicationDependencies(project);
  const authorizedRemoteHosts = new Set(
    project.sources.flatMap((source) => {
      if (!("locator" in source) || !/^https?:\/\//i.test(source.locator))
        return [];
      return [new URL(source.locator).hostname.toLowerCase()];
    }),
  );
  const issues: PreflightIssue[] = localReadiness.findings.filter(
    (finding) =>
      !(
        project.publication.profile === "offline" &&
        finding.id === "compile" &&
        finding.message.includes("requires resolved SHA-256 digests")
      ),
  );
  const manifest: PublicationManifest | null = localReadiness.manifest;
  for (const dependency of inventory) {
    if (dependency.delivery !== "unsupported") continue;
    issues.push({
      id: `unsupported-${dependency.id}`,
      area: dependency.owner.type === "chapter" ? "chapters" : "data",
      severity: "error",
      ...(dependency.owner.type === "chapter"
        ? { chapterId: dependency.owner.id }
        : dependency.owner.type === "source"
          ? { resourceId: dependency.owner.id }
          : {}),
      message: dependency.reason,
      resolution: dependency.reason,
    });
  }
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
  let estimatedIncludedBytes = inventory
    .filter(
      (dependency) =>
        dependency.delivery === "included" &&
        dependency.materialization === "bundle-runtime",
    )
    .reduce((total, dependency) => total + (dependency.estimatedBytes ?? 0), 0);
  let requiredDownloadBytes = 0;
  let unknownDownloadSizes = 0;
  let needsBuildInternet = false;
  const cacheDirectory = join(
    projectDirectory,
    ".earth-stories-cache",
    "materializations",
  );
  for (const source of project.sources) {
    const dependency = inventory.find(
      (candidate) => candidate.id === `source:${source.id}:data`,
    );
    if (dependency?.delivery === "unsupported") continue;
    if (dependency?.delivery === "connected") {
      let safe = false;
      try {
        const parsed = new URL(dependency.locator);
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
              message: `“${source.label}” remains connected to ${dependency.locator}.`,
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
      try {
        const cached = await findVerifiedRemoteMaterialization(
          cacheDirectory,
          remoteLocator,
        );
        if (cached) {
          estimatedIncludedBytes += cached.sizeBytes;
          continue;
        }
      } catch (cause) {
        issues.push({
          id: `cache-${source.id}`,
          area: "data",
          severity: "error",
          resourceId: source.id,
          message: `The cached copy of “${source.label}” failed integrity checks.`,
          resolution:
            cause instanceof Error
              ? cause.message
              : "Remove the corrupt cache entry.",
        });
        continue;
      }
      needsBuildInternet = true;
      let reportedSize = source.sizeBytes;
      try {
        let response = await authorizedFetch(
          remoteLocator,
          {
            method: "HEAD",
            signal: AbortSignal.timeout(15_000),
          },
          { allowedHosts: authorizedRemoteHosts },
        );
        if (response.status === 403 || response.status === 405)
          response = await authorizedFetch(
            remoteLocator,
            {
              headers: { range: "bytes=0-0" },
              signal: AbortSignal.timeout(15_000),
            },
            { allowedHosts: authorizedRemoteHosts },
          );
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
        if (reportedSize !== null) {
          estimatedIncludedBytes += reportedSize;
          requiredDownloadBytes += reportedSize;
        } else {
          unknownDownloadSizes += 1;
          issues.push({
            id: `unknown-size-${source.id}`,
            area: "publish",
            severity: "warning",
            resourceId: source.id,
            message: `The portable size of “${source.label}” is unknown.`,
            resolution:
              "Confirm there is enough disk space before building this release.",
          });
        }
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
  const connectedDependencies = inventory.filter(
    ({ delivery }) => delivery === "connected",
  );
  if (connectedDependencies.length)
    issues.push({
      id: "network",
      area: "publish",
      severity: "info",
      message: `${connectedDependencies.length} external resource${connectedDependencies.length === 1 ? " is" : "s are"} required by the interactive publication.`,
    });
  if (
    inventory.some(
      (dependency) =>
        dependency.delivery === "included" &&
        dependency.requirements.includes("byte-ranges"),
    )
  )
    issues.push({
      id: "hosting-byte-ranges",
      area: "publish",
      severity: "info",
      message:
        "This publication contains browser-streamed geospatial data and needs a static host that supports HTTP byte-range requests.",
    });
  if (
    project.publication.profile === "portable" &&
    connectedDependencies.length > 0
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
  const cardPath = join(projectDirectory, SHARE_CARD_SOURCE_FILENAME);
  let cardReadable = false;
  try {
    const card = await stat(cardPath);
    if (card.isFile() && card.size > 0)
      cardReadable = isValidPng(await readFile(cardPath));
  } catch {
    cardReadable = false;
  }
  if (!cardReadable)
    issues.push({
      id: "share-card",
      area: "sharing",
      severity: "warning",
      message: "This story has no usable link preview image.",
      resolution:
        "Generate a share card so the link shows artwork instead of a bare URL.",
    });
  const deduplicated = [
    ...new Map(issues.map((issue) => [issue.id, issue])).values(),
  ];
  let availableDiskBytes: number | null = null;
  try {
    const disk = await statfs(projectDirectory);
    availableDiskBytes = disk.bavail * disk.bsize;
  } catch {
    availableDiskBytes = null;
  }
  return {
    ready: !deduplicated.some((issue) => issue.severity === "error"),
    projectId: project.id,
    profile: project.publication.profile,
    buildId: manifest?.build.id ?? null,
    estimatedIncludedBytes,
    requiredDownloadBytes,
    unknownDownloadSizes,
    availableDiskBytes,
    needsBuildInternet,
    needsRuntimeInternet: connectedDependencies.length > 0,
    includedAssets: inventory.filter(
      (dependency) =>
        dependency.owner.type === "source" &&
        dependency.id.endsWith(":data") &&
        dependency.delivery === "included",
    ).length,
    connectedAssets: inventory.filter(
      (dependency) =>
        dependency.owner.type === "source" &&
        dependency.id.endsWith(":data") &&
        dependency.delivery === "connected",
    ).length,
    issues: deduplicated,
    manifest,
  };
}
