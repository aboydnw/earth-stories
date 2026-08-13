import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { StoryProject } from "@earth-stories/story-schema";
import {
  inventoryPublicationDependencies,
  NEUTRAL_BASEMAP_STYLE,
  type PublicationDependencyPlan,
} from "./dependencies.js";
import { containedRealPath } from "./paths.js";
import { authorizedFetch } from "./remote-fetch.js";

const DEFAULT_MAX_REMOTE_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_REMOTE_TIMEOUT_MS = 5 * 60 * 1000;

type IncludedPlan = Extract<
  PublicationDependencyPlan,
  { delivery: "included" }
>;

export interface MaterializedPublicationFile {
  dependencyId: string;
  href: string;
  sha256: string;
  sizeBytes: number;
  cachePath: string;
}

export interface MaterializedPublication {
  dependencyDigests: Record<string, string>;
  materializedFiles: MaterializedPublicationFile[];
  downloadedBytes: number;
  reusedCacheEntries: number;
}

export interface MaterializePublicationOptions {
  project: StoryProject;
  projectDirectory: string;
  outputDirectory: string;
  cacheDirectory?: string;
  viewerDirectory?: string;
  dependencyDigests?: Readonly<Record<string, string>>;
  maxRemoteBytes?: number;
  remoteTimeoutMs?: number;
  authorizedRemoteHosts?: readonly string[];
  fetchRemote?: (input: string, init?: RequestInit) => Promise<Response>;
}

function inside(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return (
    relation !== ".." &&
    !relation.startsWith(`..${sep}`) &&
    !isAbsolute(relation)
  );
}

function containedDestination(root: string, href: string): string {
  const canonicalRoot = resolve(root);
  const destination = resolve(canonicalRoot, href);
  if (!inside(canonicalRoot, destination))
    throw new Error(
      `Materialized dependency ${href} escapes the output folder.`,
    );
  return destination;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function findVerifiedRemoteMaterialization(
  cacheRoot: string,
  locator: string,
): Promise<{ cachePath: string; sha256: string; sizeBytes: number } | null> {
  const locatorKey = createHash("sha256").update(locator).digest("hex");
  const receiptPath = join(cacheRoot, "locators", `${locatorKey}.json`);
  try {
    const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as {
      locator?: unknown;
      sha256?: unknown;
    };
    if (
      receipt.locator !== locator ||
      typeof receipt.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(receipt.sha256)
    )
      throw new Error("Cached locator receipt is invalid.");
    const cachePath = join(cacheRoot, "sha256", receipt.sha256);
    const details = await stat(cachePath);
    if (!details.isFile() || (await sha256File(cachePath)) !== receipt.sha256)
      throw new Error("Cached remote materialization has a checksum mismatch.");
    return {
      cachePath,
      sha256: receipt.sha256,
      sizeBytes: details.size,
    };
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      return null;
    throw cause;
  }
}

async function syncFile(path: string): Promise<void> {
  const handle = await open(path, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function promoteFile(temporaryPath: string, destinationPath: string) {
  await syncFile(temporaryPath);
  await mkdir(dirname(destinationPath), { recursive: true });
  try {
    await rename(temporaryPath, destinationPath);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "EEXIST"))
      throw cause;
    await rm(temporaryPath, { force: true });
  }
}

function originalSourceLocator(
  project: StoryProject,
  dependency: IncludedPlan,
): string | null {
  if (dependency.owner.type !== "source" || !dependency.id.endsWith(":data"))
    return null;
  const source = project.sources.find(({ id }) => id === dependency.owner.id);
  if (!source) throw new Error(`Missing source ${dependency.owner.id}.`);
  return source.kind === "local-geojson" ||
    source.kind === "image" ||
    source.kind === "csv"
    ? source.path
    : source.locator;
}

function bundledBytes(
  project: StoryProject,
  dependency: IncludedPlan,
): Buffer | null {
  if (dependency.id === "basemap:neutral:style")
    return Buffer.from(NEUTRAL_BASEMAP_STYLE);
  if (
    dependency.owner.type === "source" &&
    dependency.id.endsWith(":projection")
  ) {
    const source = project.sources.find(({ id }) => id === dependency.owner.id);
    if (source?.kind === "cog" && source.cog)
      return Buffer.from(source.cog.definition);
  }
  return null;
}

async function cacheBytes(
  bytes: Buffer,
  expectedDigest: string | undefined,
  cacheRoot: string,
  dependencyId: string,
): Promise<{
  cachePath: string;
  sha256: string;
  sizeBytes: number;
  reused: boolean;
}> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (expectedDigest && sha256 !== expectedDigest)
    throw new Error(`Checksum mismatch for ${dependencyId}.`);
  const cachePath = join(cacheRoot, "sha256", sha256);
  try {
    const details = await stat(cachePath);
    if (!details.isFile() || (await sha256File(cachePath)) !== sha256)
      throw new Error(`Cached checksum mismatch for ${dependencyId}.`);
    return { cachePath, sha256, sizeBytes: details.size, reused: true };
  } catch (cause) {
    if (cause instanceof Error && !("code" in cause && cause.code === "ENOENT"))
      throw cause;
  }
  await mkdir(join(cacheRoot, "sha256"), { recursive: true });
  const temporaryPath = join(cacheRoot, `.partial-${randomUUID()}`);
  try {
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(temporaryPath, bytes),
    );
    await promoteFile(temporaryPath, cachePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return { cachePath, sha256, sizeBytes: bytes.byteLength, reused: false };
}

async function cacheLocalFile(
  sourcePath: string,
  expectedDigest: string | undefined,
  cacheRoot: string,
  dependencyId: string,
) {
  const digest = await sha256File(sourcePath);
  if (expectedDigest && digest !== expectedDigest)
    throw new Error(`Checksum mismatch for ${dependencyId}.`);
  const cachePath = join(cacheRoot, "sha256", digest);
  try {
    const details = await stat(cachePath);
    if (!details.isFile() || (await sha256File(cachePath)) !== digest)
      throw new Error(`Cached checksum mismatch for ${dependencyId}.`);
    return { cachePath, sha256: digest, sizeBytes: details.size, reused: true };
  } catch (cause) {
    if (cause instanceof Error && !("code" in cause && cause.code === "ENOENT"))
      throw cause;
  }
  await mkdir(join(cacheRoot, "sha256"), { recursive: true });
  const temporaryPath = join(cacheRoot, `.partial-${randomUUID()}`);
  try {
    await copyFile(sourcePath, temporaryPath);
    await promoteFile(temporaryPath, cachePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return {
    cachePath,
    sha256: digest,
    sizeBytes: (await stat(cachePath)).size,
    reused: false,
  };
}

async function cacheRemoteFile(
  locator: string,
  expectedDigest: string | undefined,
  cacheRoot: string,
  dependencyId: string,
  options: Required<
    Pick<MaterializePublicationOptions, "maxRemoteBytes" | "remoteTimeoutMs">
  > & { fetchRemote: typeof authorizedFetch },
) {
  const locatorKey = createHash("sha256").update(locator).digest("hex");
  const receiptPath = join(cacheRoot, "locators", `${locatorKey}.json`);
  if (!expectedDigest) {
    const cached = await findVerifiedRemoteMaterialization(cacheRoot, locator);
    if (cached) expectedDigest = cached.sha256;
  }
  if (expectedDigest) {
    const expectedPath = join(cacheRoot, "sha256", expectedDigest);
    try {
      const details = await stat(expectedPath);
      if (
        !details.isFile() ||
        (await sha256File(expectedPath)) !== expectedDigest
      )
        throw new Error(`Cached checksum mismatch for ${dependencyId}.`);
      return {
        cachePath: expectedPath,
        sha256: expectedDigest,
        sizeBytes: details.size,
        reused: true,
        downloadedBytes: 0,
      };
    } catch (cause) {
      if (
        cause instanceof Error &&
        !("code" in cause && cause.code === "ENOENT")
      )
        throw cause;
    }
  }

  await mkdir(join(cacheRoot, "sha256"), { recursive: true });
  const temporaryPath = join(cacheRoot, `.partial-${randomUUID()}`);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Remote asset download timed out.")),
    options.remoteTimeoutMs,
  );
  let downloaded = 0;
  try {
    const response = await options.fetchRemote(locator, {
      signal: controller.signal,
    });
    if (!response.ok || !response.body)
      throw new Error(
        `Could not download ${dependencyId} (${response.status}).`,
      );
    const declaredHeader = response.headers.get("content-length");
    const declaredSize =
      declaredHeader === null ? null : Number(declaredHeader);
    if (
      declaredSize !== null &&
      Number.isFinite(declaredSize) &&
      declaredSize > options.maxRemoteBytes
    )
      throw new Error(`${dependencyId} exceeds the remote inclusion limit.`);
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        downloaded += chunk.length;
        callback(
          downloaded > options.maxRemoteBytes
            ? new Error(`${dependencyId} exceeds the remote inclusion limit.`)
            : null,
          chunk,
        );
      },
    });
    await pipeline(
      Readable.fromWeb(
        response.body as import("node:stream/web").ReadableStream,
      ),
      limit,
      createWriteStream(temporaryPath, { flags: "wx" }),
    );
    if (
      declaredSize !== null &&
      Number.isFinite(declaredSize) &&
      downloaded !== declaredSize
    )
      throw new Error(
        `${dependencyId} ended after ${downloaded} bytes; expected ${declaredSize}.`,
      );
    const sha256 = await sha256File(temporaryPath);
    if (expectedDigest && sha256 !== expectedDigest)
      throw new Error(`Checksum mismatch for ${dependencyId}.`);
    const cachePath = join(cacheRoot, "sha256", sha256);
    try {
      const details = await stat(cachePath);
      if (!details.isFile() || (await sha256File(cachePath)) !== sha256)
        throw new Error(`Cached checksum mismatch for ${dependencyId}.`);
      await writeLocatorReceipt(receiptPath, locator, sha256);
      return {
        cachePath,
        sha256,
        sizeBytes: details.size,
        reused: true,
        downloadedBytes: downloaded,
      };
    } catch (cause) {
      if (
        cause instanceof Error &&
        !("code" in cause && cause.code === "ENOENT")
      )
        throw cause;
    }
    await promoteFile(temporaryPath, cachePath);
    await writeLocatorReceipt(receiptPath, locator, sha256);
    return {
      cachePath,
      sha256,
      sizeBytes: downloaded,
      reused: false,
      downloadedBytes: downloaded,
    };
  } finally {
    clearTimeout(timeout);
    await rm(temporaryPath, { force: true });
  }
}

async function writeLocatorReceipt(
  receiptPath: string,
  locator: string,
  sha256: string,
): Promise<void> {
  await mkdir(dirname(receiptPath), { recursive: true });
  const temporaryPath = `${receiptPath}.partial-${randomUUID()}`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ locator, sha256 }, null, 2)}\n`,
      { flag: "wx" },
    );
    await promoteFile(temporaryPath, receiptPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function materializePublication({
  project,
  projectDirectory,
  outputDirectory,
  cacheDirectory = join(
    projectDirectory,
    ".earth-stories-cache",
    "materializations",
  ),
  viewerDirectory,
  dependencyDigests = {},
  maxRemoteBytes = DEFAULT_MAX_REMOTE_BYTES,
  remoteTimeoutMs = DEFAULT_REMOTE_TIMEOUT_MS,
  authorizedRemoteHosts,
  fetchRemote,
}: MaterializePublicationOptions): Promise<MaterializedPublication> {
  await mkdir(cacheDirectory, { recursive: true });
  const dependencies = inventoryPublicationDependencies(project, {
    dependencyDigests,
  });
  const unsupported = dependencies.filter(
    ({ delivery }) => delivery === "unsupported",
  );
  if (unsupported.length)
    throw new Error(
      `Publication contains unsupported dependencies: ${unsupported
        .map(({ id }) => id)
        .join(", ")}`,
    );
  const allowedHosts = new Set(
    authorizedRemoteHosts?.map((host) => host.toLowerCase()) ??
      project.sources.flatMap((source) => {
        if (!("locator" in source) || !/^https?:\/\//i.test(source.locator))
          return [];
        return [new URL(source.locator).hostname.toLowerCase()];
      }),
  );
  const resolvedFetch =
    fetchRemote ??
    ((input: string, init?: RequestInit) =>
      authorizedFetch(input, init, { allowedHosts }));

  const resolved: MaterializedPublicationFile[] = [];
  let downloadedBytes = 0;
  let reusedCacheEntries = 0;
  for (const dependency of dependencies) {
    if (dependency.delivery !== "included") continue;
    const expectedDigest =
      dependency.sha256 ?? dependencyDigests[dependency.id];
    const bytes = bundledBytes(project, dependency);
    let cached;
    if (bytes) {
      cached = await cacheBytes(
        bytes,
        expectedDigest,
        cacheDirectory,
        dependency.id,
      );
    } else if (dependency.owner.type === "runtime") {
      const runtimeRoot = viewerDirectory ?? resolve("apps/viewer/public");
      cached = await cacheLocalFile(
        containedDestination(runtimeRoot, dependency.locator),
        expectedDigest,
        cacheDirectory,
        dependency.id,
      );
    } else {
      const locator = originalSourceLocator(project, dependency);
      if (!locator) throw new Error(`No materializer for ${dependency.id}.`);
      if (/^https?:\/\//i.test(locator)) {
        const remote = await cacheRemoteFile(
          locator,
          expectedDigest,
          cacheDirectory,
          dependency.id,
          { maxRemoteBytes, remoteTimeoutMs, fetchRemote: resolvedFetch },
        );
        downloadedBytes += remote.downloadedBytes;
        cached = remote;
      } else {
        const sourcePath = await containedRealPath(
          projectDirectory,
          locator,
          `Asset ${dependency.owner.id} points outside the project workspace.`,
        );
        cached = await cacheLocalFile(
          sourcePath,
          expectedDigest,
          cacheDirectory,
          dependency.id,
        );
      }
    }
    if (cached.reused) reusedCacheEntries += 1;
    resolved.push({
      dependencyId: dependency.id,
      href: dependency.locator,
      sha256: cached.sha256,
      sizeBytes: cached.sizeBytes,
      cachePath: cached.cachePath,
    });
  }

  for (const file of resolved) {
    const destination = containedDestination(outputDirectory, file.href);
    await mkdir(dirname(destination), { recursive: true });
    const temporaryPath = `${destination}.partial-${randomUUID()}`;
    try {
      await copyFile(file.cachePath, temporaryPath);
      await promoteFile(temporaryPath, destination);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  return {
    dependencyDigests: Object.fromEntries(
      resolved.map(({ dependencyId, sha256 }) => [dependencyId, sha256]),
    ),
    materializedFiles: resolved,
    downloadedBytes,
    reusedCacheEntries,
  };
}
