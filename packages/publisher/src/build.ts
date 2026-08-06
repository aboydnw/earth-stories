import {
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type {
  PublicationManifest,
  StoryProject,
} from "@earth-stories/story-schema";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { compileProject } from "./compile.js";
import { buildArchivalHtml } from "./archive.js";
import { embedInstructions } from "./embed.js";
import {
  preflightPublication,
  type PublicationPreflight,
} from "./preflight.js";
import { containedRealPath } from "./paths.js";
import { authorizedFetch } from "./remote-fetch.js";
import { verifyPublication } from "./verify.js";

const MAX_REMOTE_ASSET_BYTES = 2 * 1024 * 1024 * 1024;
const REMOTE_ASSET_TIMEOUT_MS = 5 * 60 * 1000;

async function retryFileOperation(operation: () => Promise<void>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await operation();
      return;
    } catch (cause) {
      const retryable =
        cause instanceof Error &&
        "code" in cause &&
        ["EACCES", "EBUSY", "EPERM"].includes(String(cause.code));
      if (!retryable || attempt >= 4) throw cause;
      await wait(50 * 2 ** attempt);
    }
  }
}

export interface BuildPublicationOptions {
  projectDirectory: string;
  outputDirectory: string;
  viewerDirectory?: string;
  mapSnapshots?: Record<string, string>;
}

export interface LatestPublication {
  manifest: PublicationManifest;
  preflight: PublicationPreflight;
  directory: string;
  totalBytes: number;
  builtAt: string;
}

const publicationLocks = new Map<string, Promise<void>>();

async function withPublicationLock<T>(
  projectDirectory: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = publicationLocks.get(projectDirectory) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveLock) => {
    release = resolveLock;
  });
  const tail = previous.then(() => current);
  publicationLocks.set(projectDirectory, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (publicationLocks.get(projectDirectory) === tail)
      publicationLocks.delete(projectDirectory);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function copyIncludedAssets(
  project: StoryProject,
  projectDirectory: string,
  outputDirectory: string,
): Promise<void> {
  const assetsDirectory = join(outputDirectory, "assets");
  await mkdir(assetsDirectory, { recursive: true });

  const manifest = compileProject(project);
  for (const source of project.sources) {
    const asset = manifest.assets.find(
      (candidate) => candidate.id === source.id,
    );
    if (!asset || asset.delivery !== "included") continue;
    const sourceLocator =
      source.kind === "local-geojson" ||
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
    if (!sourceLocator) continue;
    const destinationPath = join(outputDirectory, asset.href);
    await mkdir(dirname(destinationPath), { recursive: true });
    if (/^https?:\/\//i.test(sourceLocator)) {
      const temporaryPath = `${destinationPath}.partial-${randomUUID()}`;
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error("Remote asset download timed out.")),
        REMOTE_ASSET_TIMEOUT_MS,
      );
      try {
        const response = await authorizedFetch(sourceLocator, {
          signal: controller.signal,
        });
        if (!response.ok || !response.body)
          throw new Error(
            `Could not include “${source.label}” (${response.status})`,
          );
        const declaredSize = Number(response.headers.get("content-length"));
        if (
          Number.isFinite(declaredSize) &&
          declaredSize > MAX_REMOTE_ASSET_BYTES
        )
          throw new Error(
            `“${source.label}” exceeds the 2 GB inclusion limit.`,
          );
        let downloaded = 0;
        const limit = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            downloaded += chunk.length;
            if (downloaded > MAX_REMOTE_ASSET_BYTES)
              callback(
                new Error(
                  `“${source.label}” exceeds the 2 GB inclusion limit.`,
                ),
              );
            else callback(null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(
            response.body as import("node:stream/web").ReadableStream,
          ),
          limit,
          createWriteStream(temporaryPath),
        );
        await retryFileOperation(() => rename(temporaryPath, destinationPath));
      } finally {
        clearTimeout(timeout);
        await rm(temporaryPath, { force: true });
      }
    } else {
      const sourcePath = await containedRealPath(
        projectDirectory,
        sourceLocator,
        `Asset ${source.id} escapes the project directory`,
      );
      await cp(sourcePath, destinationPath);
    }
  }
}

function reportHtml(manifest: PublicationManifest): string {
  const included = manifest.assets.filter(
    (asset) => asset.delivery === "included",
  );
  const connected = manifest.assets.filter(
    (asset) => asset.delivery === "connected",
  );
  const list = (items: typeof manifest.assets) =>
    items.length === 0
      ? "<p>None.</p>"
      : `<ul>${items
          .map(
            (asset) =>
              `<li><strong>${escapeHtml(asset.label)}</strong> — ${escapeHtml(asset.href)}</li>`,
          )
          .join("")}</ul>`;
  const dependencies = manifest.externalDependencies
    .map(
      (dependency) =>
        `<li><code>${escapeHtml(dependency.resourceId)}</code> — ${escapeHtml(dependency.href)}<br><small>${escapeHtml(dependency.requirements.join(", "))}</small></li>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Publication report</title><style>body{max-width:760px;margin:48px auto;padding:0 24px;font:16px/1.55 system-ui;color:#332b27}h1,h2{font-family:Georgia,serif}code{background:#f2ede7;padding:2px 5px}</style><body><h1>Publication report</h1><p><strong>${escapeHtml(manifest.metadata.title)}</strong></p><p>Build <code>${escapeHtml(manifest.build.id)}</code> · Runtime ${escapeHtml(manifest.build.runtimeVersion)} · Profile ${escapeHtml(manifest.publication.profile)}</p><h2>Hosting requirements</h2><p>${escapeHtml(manifest.hostingRequirements.join(", "))}</p><h2>Included assets</h2>${list(included)}<h2>Connected data assets</h2>${list(connected)}<h2>All external dependencies</h2><ul>${dependencies}</ul><p>External dependencies must remain publicly accessible for the story to work.</p></body></html>`;
}

export async function buildPublication({
  projectDirectory,
  outputDirectory,
  viewerDirectory,
  mapSnapshots,
}: BuildPublicationOptions): Promise<PublicationManifest> {
  const projectPath = join(projectDirectory, "story.json");
  const project = storyProjectSchema.parse(
    JSON.parse(await readFile(projectPath, "utf8")) as unknown,
  );
  const manifest = compileProject(project);

  await rm(outputDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 75,
  });
  await mkdir(outputDirectory, { recursive: true });
  await copyIncludedAssets(project, projectDirectory, outputDirectory);

  if (viewerDirectory) {
    await cp(viewerDirectory, outputDirectory, { recursive: true });
    await cp(
      join(outputDirectory, "index.html"),
      join(outputDirectory, "embed.html"),
    );
  } else {
    await writeFile(
      join(outputDirectory, "index.html"),
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>Build the viewer first</title><body><p>The publication manifest is ready. Build the viewer application before release.</p></body></html>',
    );
  }

  await writeFile(
    join(outputDirectory, "publication.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    join(outputDirectory, "archival.html"),
    await buildArchivalHtml({
      project,
      manifest,
      projectDirectory,
      mapSnapshots,
    }),
  );
  if (viewerDirectory)
    await writeFile(
      join(outputDirectory, "EMBED.txt"),
      embedInstructions(manifest.metadata.title),
    );
  await writeFile(
    join(outputDirectory, "publication-report.html"),
    reportHtml(manifest),
  );
  await writeFile(
    join(outputDirectory, "README.txt"),
    `${manifest.metadata.title}\n\nUpload every file in this directory to the same static website directory. Open index.html through a static web server.\n\nInteractive story: index.html\n${viewerDirectory ? "Embeddable story: embed.html\nEmbed instructions: EMBED.txt\n" : ""}Archival edition: archival.html\nBuild: ${manifest.build.id}\nProject: ${basename(projectDirectory)}\nManifest: publication.json\nReport: publication-report.html\n`,
  );
  return manifest;
}

async function directorySize(directory: string): Promise<number> {
  const entries = await import("node:fs/promises").then(({ readdir }) =>
    readdir(directory, { withFileTypes: true }),
  );
  let total = 0;
  for (const entry of entries) {
    const path = join(directory, entry.name);
    total += entry.isDirectory()
      ? await directorySize(path)
      : entry.isFile()
        ? (await stat(path)).size
        : 0;
  }
  return total;
}

export async function buildLatestPublication(
  options: Omit<BuildPublicationOptions, "outputDirectory">,
): Promise<LatestPublication> {
  const projectDirectory = resolve(options.projectDirectory);
  return withPublicationLock(projectDirectory, () =>
    buildLatestPublicationUnlocked({ ...options, projectDirectory }),
  );
}

async function buildLatestPublicationUnlocked(
  options: Omit<BuildPublicationOptions, "outputDirectory">,
): Promise<LatestPublication> {
  const projectDirectory = resolve(options.projectDirectory);
  const target = join(projectDirectory, "publication");
  const temporary = join(
    projectDirectory,
    `.earth-stories-publication-${randomUUID()}`,
  );
  const previous = join(
    projectDirectory,
    ".earth-stories-publication-previous",
  );
  const preflight = await preflightPublication(projectDirectory);
  if (!preflight.ready)
    throw new Error(
      `Publication preflight failed: ${preflight.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  const builtAt = new Date().toISOString();
  try {
    const manifest = await buildPublication({
      ...options,
      projectDirectory,
      outputDirectory: temporary,
    });
    const verification = await verifyPublication(temporary, manifest, {
      requireEmbed: Boolean(options.viewerDirectory),
    });
    await writeFile(
      join(temporary, "publication-verification.json"),
      `${JSON.stringify(verification, null, 2)}\n`,
    );
    let totalBytes = await directorySize(temporary);
    const summaryPath = join(temporary, "publication-summary.json");
    for (;;) {
      await writeFile(
        summaryPath,
        `${JSON.stringify({ builtAt, totalBytes, preflight: { ...preflight, manifest: undefined } }, null, 2)}\n`,
      );
      const measuredBytes = await directorySize(temporary);
      if (measuredBytes === totalBytes) break;
      totalBytes = measuredBytes;
    }
    await rm(previous, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 75,
    });
    try {
      await retryFileOperation(() => rename(target, previous));
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    try {
      await retryFileOperation(() => rename(temporary, target));
    } catch (error) {
      try {
        await retryFileOperation(() => rename(previous, target));
      } catch {
        /* Preserve the original failure. */
      }
      throw error;
    }
    await rm(previous, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 75,
    });
    return { manifest, preflight, directory: target, totalBytes, builtAt };
  } finally {
    await rm(temporary, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 75,
    });
  }
}
