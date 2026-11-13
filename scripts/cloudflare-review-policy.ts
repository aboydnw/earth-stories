import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { PublicationManifest } from "@earth-stories/story-schema";

export const CLOUDFLARE_FILE_LIMIT = 25 * 1024 * 1024;

/** An operator acknowledgement, never authentication or an Access API check. */
export function requirePrivateReviewBuild(env: NodeJS.ProcessEnv, sha: string) {
  if (
    env.EARTH_STORIES_PRIVATE_REVIEW_ACCESS_VERIFIED !== "true" ||
    !env.EARTH_STORIES_REVIEW_BRANCH ||
    env.CF_PAGES_BRANCH !== env.EARTH_STORIES_REVIEW_BRANCH ||
    env.CF_PAGES_COMMIT_SHA !== sha
  ) {
    throw new Error(
      "Review deployment disabled. Verify Access on the project root AND all preview URLs, then explicitly allow this branch and exact Pages checkout. See docs/private-review-previews.md.",
    );
  }
}

/** Deliberately limited to this example, not a general export optimizer. */
export function assertReviewManifest(manifest: PublicationManifest) {
  if (
    manifest.runtimeAssets.length !== 0 ||
    manifest.dependencies.some((item) => item.owner.type === "runtime") ||
    manifest.assets.some(
      (asset) =>
        !["image", "csv", "trajectory", "geojson", "pmtiles"].includes(
          asset.kind,
        ),
    )
  ) {
    throw new Error(
      "This review build cannot omit DuckDB: unexpected source kind or runtime dependency. Use the ordinary publication build and a compatible host.",
    );
  }
  if (
    manifest.hostingRequirements.includes("byte-ranges") ||
    manifest.dependencies.some(
      (item) =>
        item.delivery === "included" &&
        item.requirements.includes("byte-ranges"),
    ) ||
    manifest.assets.some(
      (asset) => asset.delivery === "included" && asset.kind === "pmtiles",
    )
  ) {
    throw new Error(
      "Cloudflare review static assets cannot serve this publication's local byte-range dependencies. Keep PMTiles connected or use a verified range-capable host.",
    );
  }
}

export async function assertCloudflareFiles(directory: string) {
  const files: { path: string; bytes: number }[] = [];
  async function walk(relative: string) {
    for (const entry of await readdir(join(directory, relative), {
      withFileTypes: true,
    })) {
      const path = join(relative, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Symlink in review output: ${path}`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const { size } = await stat(join(directory, path));
        if (size > CLOUDFLARE_FILE_LIMIT)
          throw new Error(
            `Cloudflare 25 MiB per-file limit exceeded: ${path} (${size} bytes)`,
          );
        files.push({ path, bytes: size });
      } else throw new Error(`Unsupported review output entry: ${path}`);
    }
  }
  await walk("");
  return files;
}
