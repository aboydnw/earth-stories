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
import {
  materializePublication,
  type MaterializedPublication,
} from "./materialize.js";
import {
  buildShareKit,
  injectShareMeta,
  SHARE_CARD_PATH,
  SHARE_CARD_SOURCE_FILENAME,
  SHARE_POST_TEXT_PATH,
} from "./share.js";
import { verifyPublication } from "./verify.js";

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
  publicationUrl?: string;
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

function reportHtml(
  manifest: PublicationManifest,
  materialized: MaterializedPublication,
): string {
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
  const dependencies = manifest.dependencies
    .map(
      (dependency) =>
        `<li><code>${escapeHtml(dependency.id)}</code> — ${escapeHtml(dependency.delivery)} — ${escapeHtml(dependency.locator)}<br><small>${escapeHtml(dependency.requirements.join(", ") || "no runtime requirements")}</small></li>`,
    )
    .join("");
  const needsRuntimeInternet = manifest.dependencies.some(
    (dependency) => dependency.delivery === "connected",
  );
  const includedBytes = materialized.materializedFiles.reduce(
    (total, file) => total + file.sizeBytes,
    0,
  );
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Publication report</title><style>body{max-width:760px;margin:48px auto;padding:0 24px;font:16px/1.55 system-ui;color:#332b27}h1,h2{font-family:Georgia,serif}code{background:#f2ede7;padding:2px 5px}</style><body><h1>Publication report</h1><p><strong>${escapeHtml(manifest.metadata.title)}</strong></p><p>Build <code>${escapeHtml(manifest.build.id)}</code> · Runtime ${escapeHtml(manifest.build.runtimeVersion)} · Profile ${escapeHtml(manifest.publication.profile)}</p><h2>Connectivity</h2><p>Internet needed to assemble: ${materialized.downloadedBytes > 0 ? "yes" : "no"}<br>Internet needed at runtime: ${needsRuntimeInternet ? "yes" : "no"}<br>Downloaded during assembly: ${materialized.downloadedBytes.toLocaleString("en-US")} bytes<br>Included materialized files: ${includedBytes.toLocaleString("en-US")} bytes</p><h2>Hosting requirements</h2><p>${escapeHtml(manifest.hostingRequirements.join(", "))}</p><h2>Included assets</h2>${list(included)}<h2>Connected data assets</h2>${list(connected)}<h2>Authoritative dependencies</h2><ul>${dependencies}</ul>${needsRuntimeInternet ? "<p>Connected dependencies must remain publicly accessible for the story to work.</p>" : "<p>No publication dependency requires internet access at runtime.</p>"}</body></html>`;
}

async function writeShareKit(
  project: StoryProject,
  projectDirectory: string,
  outputDirectory: string,
  publicationUrl: string | undefined,
): Promise<void> {
  const kit = buildShareKit({ project, publicationUrl });
  const indexPath = join(outputDirectory, "index.html");
  await writeFile(
    indexPath,
    injectShareMeta(await readFile(indexPath, "utf8"), kit.metaTags),
  );
  await mkdir(join(outputDirectory, dirname(SHARE_POST_TEXT_PATH)), {
    recursive: true,
  });
  await writeFile(join(outputDirectory, SHARE_POST_TEXT_PATH), kit.postText);
  const card = join(projectDirectory, SHARE_CARD_SOURCE_FILENAME);
  try {
    await cp(card, join(outputDirectory, SHARE_CARD_PATH));
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT"))
      throw cause;
  }
}

export async function buildPublication({
  projectDirectory,
  outputDirectory,
  viewerDirectory,
  mapSnapshots,
  publicationUrl,
}: BuildPublicationOptions): Promise<PublicationManifest> {
  const projectPath = join(projectDirectory, "story.json");
  const project = storyProjectSchema.parse(
    JSON.parse(await readFile(projectPath, "utf8")) as unknown,
  );

  await rm(outputDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 75,
  });
  await mkdir(outputDirectory, { recursive: true });

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
  const materialized = await materializePublication({
    project,
    projectDirectory,
    outputDirectory,
    viewerDirectory,
  });
  const manifest = compileProject(project, {
    dependencyDigests: materialized.dependencyDigests,
  });

  await writeShareKit(
    project,
    projectDirectory,
    outputDirectory,
    publicationUrl,
  );

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
    reportHtml(manifest, materialized),
  );
  await writeFile(
    join(outputDirectory, "README.txt"),
    `${manifest.metadata.title}\n\nUpload every file in this directory to the same static website directory. Open index.html through a static web server.\n\nInteractive story: index.html\n${viewerDirectory ? "Embeddable story: embed.html\nEmbed instructions: EMBED.txt\n" : ""}Archival edition: archival.html\nLink preview text: ${SHARE_POST_TEXT_PATH}\nBuild: ${manifest.build.id}\nProject: ${basename(projectDirectory)}\nManifest: publication.json\nReport: publication-report.html\n`,
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
      requireShareKit: true,
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
