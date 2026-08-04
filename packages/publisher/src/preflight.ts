import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  PublicationManifest,
  StoryProject,
} from "@earth-stories/story-schema";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { compileProject } from "./compile.js";
import { containedRealPath } from "./paths.js";

export type PreflightSeverity = "error" | "warning" | "info";
export interface PreflightIssue {
  id: string;
  severity: PreflightSeverity;
  message: string;
  resolution?: string;
  resourceId?: string;
}
export interface PublicationPreflight {
  ready: boolean;
  projectId: string;
  buildId: string | null;
  estimatedIncludedBytes: number;
  includedAssets: number;
  connectedAssets: number;
  issues: PreflightIssue[];
  manifest: PublicationManifest | null;
}

function localLocator(source: StoryProject["sources"][number]): string | null {
  return source.kind === "local-geojson" ||
    source.kind === "image" ||
    source.kind === "csv"
    ? source.path
    : source.kind === "pmtiles" || source.kind === "geoparquet"
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
  const issues: PreflightIssue[] = [];
  let manifest: PublicationManifest | null = null;
  try {
    manifest = compileProject(project);
  } catch (cause) {
    issues.push({
      id: "compile",
      severity: "error",
      message:
        cause instanceof Error ? cause.message : "Project cannot be compiled",
      resolution: "Repair the referenced chapter or source before exporting.",
    });
  }
  if (!project.metadata.description.trim())
    issues.push({
      id: "description",
      severity: "warning",
      message: "The story has no description.",
      resolution: "Add a short summary for readers and archive catalogs.",
    });
  for (const chapter of project.chapters) {
    if (!chapter.title.trim())
      issues.push({
        id: `chapter-title-${chapter.id}`,
        severity: "error",
        message: "A chapter has no title.",
        resolution: "Give every chapter a title.",
      });
    if (!chapter.narrative.trim())
      issues.push({
        id: `chapter-narrative-${chapter.id}`,
        severity: "warning",
        message: `“${chapter.title || "Untitled chapter"}” has no narrative.`,
      });
    if (chapter.type === "image" && !chapter.alt.trim())
      issues.push({
        id: `image-alt-${chapter.id}`,
        severity: "warning",
        message: `“${chapter.title}” has no alternative text.`,
        resolution:
          "Describe the image for readers using assistive technology.",
      });
    if (chapter.type === "map" || chapter.type === "scrolly")
      issues.push({
        id: `archive-snapshot-${chapter.id}`,
        severity: "info",
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
              severity: "warning",
              resourceId: source.id,
              message: `“${source.label}” remains connected to ${asset.href}.`,
              resolution:
                "Confirm the URL permits CORS and stays publicly available.",
            }
          : {
              id: `unsafe-url-${source.id}`,
              severity: "error",
              resourceId: source.id,
              message: `“${source.label}” does not use a valid HTTP or HTTPS URL.`,
            },
      );
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
      severity: "info",
      message: `${manifest.externalDependencies.length} external resource${manifest.externalDependencies.length === 1 ? " is" : "s are"} required by the interactive publication.`,
    });
  return {
    ready: !issues.some((issue) => issue.severity === "error"),
    projectId: project.id,
    buildId: manifest?.build.id ?? null,
    estimatedIncludedBytes,
    includedAssets:
      manifest?.assets.filter((asset) => asset.delivery === "included")
        .length ?? 0,
    connectedAssets:
      manifest?.assets.filter((asset) => asset.delivery === "connected")
        .length ?? 0,
    issues,
    manifest,
  };
}
