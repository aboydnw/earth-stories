import { stat } from "node:fs/promises";
import { collectReleaseFiles } from "./git-objects.js";

export const PAGES_SITE_LIMIT_BYTES = 1_000_000_000;
export const PAGES_SITE_WARN_BYTES = 800_000_000;
export const PAGES_FILE_LIMIT_BYTES = 100_000_000;

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

export interface SizeVerdict {
  blocked: boolean;
  message: string | null;
}

/**
 * Judges an estimate from preflight before anything is built, so a story that
 * cannot fit on Pages fails in a second rather than after a long build and a
 * partial upload. The portable profile is named because copying COG, PMTiles,
 * and GeoParquet into the release is what pushes stories over the ceiling.
 */
export function checkEstimatedSize(
  estimatedIncludedBytes: number,
  profile?: string,
): SizeVerdict {
  const portableHint =
    profile === "portable"
      ? " The portable profile copies data into the release; the connected profile keeps it at its source."
      : "";
  if (estimatedIncludedBytes >= PAGES_SITE_LIMIT_BYTES)
    return {
      blocked: true,
      message: `This story is about ${megabytes(estimatedIncludedBytes)}, over the 1 GB GitHub Pages limit.${portableHint}`,
    };
  if (estimatedIncludedBytes >= PAGES_SITE_WARN_BYTES)
    return {
      blocked: false,
      message: `This story is about ${megabytes(estimatedIncludedBytes)}, close to the 1 GB GitHub Pages limit.${portableHint}`,
    };
  return { blocked: false, message: null };
}

export interface ReleaseInspection {
  totalBytes: number;
  largestFile: { path: string; bytes: number } | null;
}

/**
 * Measures a built release: GitHub Pages rejects any single file over 100 MB,
 * which no estimate of total size would catch.
 */
export async function inspectRelease(
  directory: string,
): Promise<ReleaseInspection> {
  let totalBytes = 0;
  let largestFile: ReleaseInspection["largestFile"] = null;

  for (const file of await collectReleaseFiles(directory)) {
    const info = await stat(file.absolute);
    totalBytes += info.size;
    if (!largestFile || info.size > largestFile.bytes)
      largestFile = { path: file.path, bytes: info.size };
  }
  return { totalBytes, largestFile };
}

/**
 * Reports why a built release cannot go to Pages, naming the offending file
 * rather than leaving the author to guess which asset is too large.
 */
export function checkReleaseLimits(inspection: ReleaseInspection): SizeVerdict {
  if (inspection.totalBytes >= PAGES_SITE_LIMIT_BYTES)
    return {
      blocked: true,
      message: `The built release is ${megabytes(inspection.totalBytes)}, over the 1 GB GitHub Pages limit.`,
    };
  const largest = inspection.largestFile;
  if (largest && largest.bytes >= PAGES_FILE_LIMIT_BYTES)
    return {
      blocked: true,
      message: `${largest.path} is ${megabytes(largest.bytes)}. GitHub Pages rejects files over 100 MB.`,
    };
  if (inspection.totalBytes >= PAGES_SITE_WARN_BYTES)
    return {
      blocked: false,
      message: `The built release is ${megabytes(inspection.totalBytes)}, close to the 1 GB GitHub Pages limit.`,
    };
  return { blocked: false, message: null };
}
