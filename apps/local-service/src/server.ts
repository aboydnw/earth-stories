import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { extname, join, relative } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ProjectStore } from "@earth-stories/project-store";
import {
  buildLatestPublication,
  authorizedFetch,
  createEmbedSnippet,
  discoverRemoteSource,
  preflightPublication,
  PUBLICATION_URL_PLACEHOLDER,
  SHARE_CARD_SOURCE_FILENAME,
} from "@earth-stories/publisher";
import { Zip, ZipDeflate } from "fflate";
import { parseByteRange } from "./range.js";
import {
  exampleCatalog,
  exampleConnections,
  findExampleStory,
} from "./examples.js";
import { loadExampleAssetFiles } from "./exampleAssets.js";
import {
  assertCapabilitySecurity,
  isTrustedMutationOrigin,
  requireCapability,
} from "./security.js";
import { checkShareLink, decodeShareCard } from "./share-health.js";
import { storeShareCard } from "./share-card.js";
import {
  canonicalizeRequestPath,
  loadImmutableEditorPaths,
  serveEditorFile,
  staticNotFound,
} from "./static.js";
import { ConversionJobs } from "./conversion-jobs.js";
import { PagesJobs } from "./pages-jobs.js";
import type { ResolvedLocalServiceConfig } from "./config.js";

const contentTypes: Record<string, string> = {
  ".geojson": "application/geo+json",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".csv": "text/csv",
  ".pmtiles": "application/vnd.pmtiles",
  ".parquet": "application/vnd.apache.parquet",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

async function readJson(
  request: IncomingMessage,
  limit: number,
): Promise<unknown> {
  return JSON.parse((await readBody(request, limit)).toString("utf8"));
}

async function readOptionalJson(
  request: IncomingMessage,
  limit: number,
): Promise<Record<string, unknown>> {
  const body = await readBody(request, limit);
  return body.length
    ? (JSON.parse(body.toString("utf8")) as Record<string, unknown>)
    : {};
}

async function readBody(
  request: IncomingMessage,
  limit: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function proxyRemoteSource(
  remoteValue: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const headers: Record<string, string> = {
    "accept-encoding": "identity",
  };
  if (request.headers.range) headers.range = request.headers.range;
  const upstream = await authorizedFetch(remoteValue, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
  });
  if (!upstream.ok && upstream.status !== 206) {
    await upstream.body?.cancel();
    json(response, 502, {
      error: `The connected source returned ${upstream.status}`,
    });
    return;
  }
  const responseHeaders: Record<string, string> = {
    "content-type":
      upstream.headers.get("content-type") ?? "application/octet-stream",
    "cache-control": "private, max-age=300",
    ...(upstream.headers.get("accept-ranges")
      ? { "accept-ranges": upstream.headers.get("accept-ranges")! }
      : {}),
  };
  const contentEncoding = upstream.headers.get("content-encoding");
  for (const name of ["content-range", "etag"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }
  if (!contentEncoding || contentEncoding === "identity") {
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) responseHeaders["content-length"] = contentLength;
  }
  response.writeHead(upstream.status, responseHeaders);
  if (request.method === "HEAD" || !upstream.body) {
    await upstream.body?.cancel();
    response.end();
    return;
  }
  const stream = Readable.fromWeb(upstream.body as never);
  try {
    await pipeline(stream, response);
  } catch (cause) {
    if (!response.destroyed)
      response.destroy(cause instanceof Error ? cause : undefined);
  }
}

async function collectFilePaths(
  directory: string,
  root = directory,
): Promise<Array<{ absolute: string; archive: string }>> {
  const files: Array<{ absolute: string; archive: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await collectFilePaths(path, root)));
    else if (entry.isFile())
      files.push({
        absolute: path,
        archive: relative(root, path).replaceAll("\\", "/"),
      });
  }
  return files;
}

async function streamZip(
  directory: string,
  response: ServerResponse,
): Promise<void> {
  let backpressured = false;
  let resolveDone!: () => void;
  let rejectDone!: (cause: unknown) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const archive = new Zip((error, chunk, final) => {
    if (error) {
      rejectDone(error);
      return;
    }
    if (chunk.length) backpressured = !response.write(chunk);
    if (final) {
      response.end();
      resolveDone();
    }
  });
  try {
    for (const file of await collectFilePaths(directory)) {
      const entry = new ZipDeflate(file.archive, { level: 6 });
      archive.add(entry);
      for await (const chunk of createReadStream(file.absolute)) {
        if (response.writableEnded || response.destroyed)
          throw new Error("Client closed the publication download");
        entry.push(new Uint8Array(chunk), false);
        if (backpressured) {
          await new Promise<void>((resolveDrain, rejectDrain) => {
            const settle = (cause?: unknown) => {
              response.off("drain", onDrain);
              response.off("close", onClose);
              response.off("error", onError);
              if (cause) rejectDrain(cause);
              else resolveDrain();
            };
            const onDrain = () => settle();
            const onClose = () =>
              settle(new Error("Client closed the publication download"));
            const onError = (cause: Error) => settle(cause);
            response.once("drain", onDrain);
            response.once("close", onClose);
            response.once("error", onError);
          });
          backpressured = false;
        }
      }
      entry.push(new Uint8Array(), true);
    }
    archive.end();
    await done;
  } catch (cause) {
    archive.terminate();
    throw cause;
  }
}

const publicationLocks = new Map<string, Promise<void>>();
export async function withProjectPublicationLock<T>(
  projectId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = publicationLocks.get(projectId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveLock) => {
    release = resolveLock;
  });
  const tail = previous.then(() => current);
  publicationLocks.set(projectId, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (publicationLocks.get(projectId) === tail)
      publicationLocks.delete(projectId);
  }
}

function projectRoute(pathname: string): { id: string; asset?: string } | null {
  const match = pathname.match(/^\/api\/projects\/([^/]+)(?:\/assets\/(.+))?$/);
  if (!match) return null;
  return {
    id: decodeURIComponent(match[1]),
    asset: match[2] ? decodeURIComponent(match[2]) : undefined,
  };
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createLocalServer(
  store: ProjectStore,
  config: ResolvedLocalServiceConfig,
  jobs: {
    conversion: ConversionJobs;
    pages: PagesJobs;
  },
  internal: {
    testOnlyDisableTrustedMutationOrigin?: boolean;
    testOnlyBeforeStaticIdentityCheck?: (path: string) => Promise<void>;
    testOnlyAfterStaticOpen?: (path: string) => Promise<void>;
  } = {},
): Server {
  assertCapabilitySecurity(
    config.capabilityToken,
    !internal.testOnlyDisableTrustedMutationOrigin,
  );
  const conversionJobs = jobs.conversion;
  const pagesJobs = jobs.pages;
  const immutableEditorPaths = config.editorDirectory
    ? loadImmutableEditorPaths(config.editorDirectory)
    : Promise.resolve(new Set<string>());
  let server: Server;
  server = createServer(async (request, response) => {
    response.setHeader("x-content-type-options", "nosniff");
    const address = server.address();
    const port =
      address && typeof address !== "string" ? address.port : config.port;
    const url = new URL(request.url ?? "/", `http://${config.host}:${port}`);

    try {
      if (!requireCapability(request, config.capabilityToken)) {
        json(response, 401, { error: "Unauthorized" });
        return;
      }
      if (
        MUTATING_METHODS.has(request.method ?? "") &&
        !isTrustedMutationOrigin(request.headers.origin)
      ) {
        json(response, 403, { error: "Untrusted request origin" });
        return;
      }
      if (request.method === "GET" && url.pathname === "/health") {
        json(response, 200, { status: "ready", projectsDirectory: store.root });
        return;
      }

      if (url.pathname === "/api/projects" && request.method === "GET") {
        json(response, 200, await store.list());
        return;
      }

      if (url.pathname === "/api/discover" && request.method === "POST") {
        const body = (await readJson(request, config.limits.maxBodyBytes)) as {
          url?: unknown;
        };
        if (typeof body.url !== "string")
          throw new Error("Enter a public data URL to inspect");
        json(response, 200, await discoverRemoteSource(body.url));
        return;
      }

      if (url.pathname === "/api/examples" && request.method === "GET") {
        json(response, 200, exampleCatalog());
        return;
      }

      const exampleConnectionContentMatch = url.pathname.match(
        /^\/api\/examples\/connections\/([^/]+)\/content$/,
      );
      if (
        exampleConnectionContentMatch &&
        (request.method === "GET" || request.method === "HEAD")
      ) {
        const example = exampleConnections.find(
          (item) =>
            item.id === decodeURIComponent(exampleConnectionContentMatch[1]),
        );
        if (!example) {
          json(response, 404, { error: "Example connection not found" });
          return;
        }
        await proxyRemoteSource(example.locator, request, response);
        return;
      }

      const exampleStoryMatch = url.pathname.match(
        /^\/api\/examples\/stories\/([^/]+)$/,
      );
      if (exampleStoryMatch && request.method === "POST") {
        const example = findExampleStory(
          decodeURIComponent(exampleStoryMatch[1]),
        );
        if (!example) {
          json(response, 404, { error: "Example story not found" });
          return;
        }
        const assetFiles = await loadExampleAssetFiles(example.id);
        json(
          response,
          201,
          await store.createFromTemplate(example, assetFiles),
        );
        return;
      }

      if (url.pathname === "/api/projects" && request.method === "POST") {
        const body = (await readJson(request, config.limits.maxBodyBytes)) as {
          title?: unknown;
          description?: unknown;
          author?: unknown;
        };
        const project = await store.create({
          title: typeof body.title === "string" ? body.title : "",
          description:
            typeof body.description === "string" ? body.description : undefined,
          author: typeof body.author === "string" ? body.author : null,
        });
        json(response, 201, project);
        return;
      }

      const route = projectRoute(url.pathname);
      const connectedSourceMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/sources\/([^/]+)\/content$/,
      );
      if (
        connectedSourceMatch &&
        (request.method === "GET" || request.method === "HEAD")
      ) {
        const projectId = decodeURIComponent(connectedSourceMatch[1]);
        const sourceId = decodeURIComponent(connectedSourceMatch[2]);
        const project = await store.read(projectId);
        const source = project.sources.find((item) => item.id === sourceId);
        if (
          !source ||
          !("locator" in source) ||
          source.delivery !== "connected"
        ) {
          json(response, 404, { error: "Connected source not found" });
          return;
        }
        await proxyRemoteSource(source.locator, request, response);
        return;
      }
      const conversionCollectionMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/conversions$/,
      );
      if (conversionCollectionMatch && request.method === "POST") {
        const projectId = decodeURIComponent(conversionCollectionMatch[1]);
        json(
          response,
          202,
          await conversionJobs.create(
            projectId,
            (await readJson(request, config.limits.maxBodyBytes)) as {
              operation?: unknown;
              capability?: unknown;
              assetPath?: unknown;
              options?: unknown;
            },
          ),
        );
        return;
      }
      const conversionJobMatch = url.pathname.match(
        /^\/api\/conversion-jobs\/([^/]+)$/,
      );
      if (conversionJobMatch && request.method === "GET") {
        const job = conversionJobs.get(
          decodeURIComponent(conversionJobMatch[1]),
        );
        if (!job) {
          json(response, 404, { error: "Conversion job not found" });
          return;
        }
        json(response, 200, job);
        return;
      }
      const conversionActionMatch = url.pathname.match(
        /^\/api\/conversion-jobs\/([^/]+)\/(acknowledge|cancel|retry)$/,
      );
      if (conversionActionMatch && request.method === "POST") {
        const id = decodeURIComponent(conversionActionMatch[1]);
        if (!conversionJobs.get(id)) {
          json(response, 404, { error: "Conversion job not found" });
          return;
        }
        const action = conversionActionMatch[2];
        const accepted =
          action === "acknowledge"
            ? conversionJobs.acknowledge(id)
            : action === "cancel"
              ? conversionJobs.cancel(id)
              : conversionJobs.retry(id);
        if (!accepted) {
          json(response, 409, {
            error: `The conversion cannot ${action} from its current state.`,
          });
          return;
        }
        json(response, 200, conversionJobs.get(id));
        return;
      }
      const preflightMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/export\/preflight$/,
      );
      if (preflightMatch && request.method === "GET") {
        json(
          response,
          200,
          await preflightPublication(
            store.projectPath(decodeURIComponent(preflightMatch[1])),
          ),
        );
        return;
      }
      const shareCardMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/share-card$/,
      );
      if (shareCardMatch && request.method === "GET") {
        const id = decodeURIComponent(shareCardMatch[1]);
        await store.read(id).catch(() => {
          throw new Error(`Project "${id}" was not found`);
        });
        const card = await readFile(
          join(store.projectPath(id), SHARE_CARD_SOURCE_FILENAME),
        );
        response.writeHead(200, {
          "content-type": "image/png",
          "content-length": card.byteLength,
          "cache-control": "no-store",
        });
        response.end(card);
        return;
      }
      if (shareCardMatch && request.method === "POST") {
        const id = decodeURIComponent(shareCardMatch[1]);
        await store.read(id).catch(() => {
          throw new Error(`Project "${id}" was not found`);
        });
        const body = (await readJson(
          request,
          config.limits.maxShareCardBodyBytes,
        )) as {
          image?: unknown;
        } | null;
        const card = decodeShareCard(body?.image);
        await withProjectPublicationLock(id, () =>
          storeShareCard(store.projectPath(id), card),
        );
        json(response, 200, { bytes: card.byteLength });
        return;
      }

      const publishMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/publish$/,
      );
      if (publishMatch && request.method === "POST") {
        const projectId = decodeURIComponent(publishMatch[1]);
        json(
          response,
          202,
          await pagesJobs.create(
            projectId,
            (await readOptionalJson(
              request,
              config.limits.maxExportBodyBytes,
            )) as {
              repo?: unknown;
              mapSnapshots?: unknown;
            },
          ),
        );
        return;
      }
      const publishRecordMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/publish-record$/,
      );
      if (publishRecordMatch && request.method === "GET") {
        json(response, 200, {
          record: await pagesJobs.record(
            decodeURIComponent(publishRecordMatch[1]),
          ),
        });
        return;
      }
      const publishJobMatch = url.pathname.match(
        /^\/api\/publish-jobs\/([^/]+)$/,
      );
      if (publishJobMatch && request.method === "GET") {
        const job = pagesJobs.get(decodeURIComponent(publishJobMatch[1]));
        if (!job) {
          json(response, 404, { error: "Publish job not found" });
          return;
        }
        json(response, 200, job);
        return;
      }

      if (
        url.pathname === "/api/share/link-health" &&
        request.method === "POST"
      ) {
        const body = (await readJson(request, config.limits.maxBodyBytes)) as {
          url?: unknown;
        };
        if (typeof body.url !== "string")
          throw new Error("Enter the URL where you published the story");
        json(response, 200, await checkShareLink(body.url));
        return;
      }

      const exportMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/export$/,
      );
      if (exportMatch && request.method === "POST") {
        const id = decodeURIComponent(exportMatch[1]);
        const format = url.searchParams.get("format") ?? "zip";
        if (!["zip", "folder", "archive", "embed"].includes(format))
          throw new Error("Unknown export format");
        await access(join(config.viewerDirectory, "index.html"));
        const body = await readOptionalJson(
          request,
          config.limits.maxExportBodyBytes,
        );
        const snapshots =
          typeof body.mapSnapshots === "object" && body.mapSnapshots !== null
            ? (body.mapSnapshots as Record<string, string>)
            : undefined;
        const publicationUrl =
          typeof body.publicationUrl === "string" && body.publicationUrl.trim()
            ? body.publicationUrl.trim()
            : PUBLICATION_URL_PLACEHOLDER;
        await withProjectPublicationLock(id, async () => {
          const latest = await buildLatestPublication({
            projectDirectory: store.projectPath(id),
            viewerDirectory: config.viewerDirectory,
            mapSnapshots: snapshots,
            publicationUrl,
          });
          if (format === "folder") {
            json(response, 200, {
              format,
              directory: latest.directory,
              buildId: latest.manifest.build.id,
              totalBytes: latest.totalBytes,
              builtAt: latest.builtAt,
            });
            return;
          }
          if (format === "archive") {
            const html = await readFile(
              join(latest.directory, "archival.html"),
            );
            response.writeHead(200, {
              "content-type": "text/html; charset=utf-8",
              "content-disposition": `attachment; filename="${id}-${latest.manifest.build.id}-archival.html"`,
              "content-length": html.byteLength,
              "cache-control": "no-store",
            });
            response.end(html);
            return;
          }
          if (format === "embed") {
            json(response, 200, {
              format,
              directory: latest.directory,
              buildId: latest.manifest.build.id,
              entrypoint: "embed.html",
              snippet: createEmbedSnippet({
                publicationUrl,
                title: latest.manifest.metadata.title,
              }),
            });
            return;
          }
          response.writeHead(200, {
            "content-type": "application/zip",
            "content-disposition": `attachment; filename="${id}-${latest.manifest.build.id}.zip"`,
            "cache-control": "no-store",
          });
          try {
            await streamZip(latest.directory, response);
          } catch (cause) {
            response.destroy(cause instanceof Error ? cause : undefined);
          }
        });
        return;
      }

      const assetCollectionMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/assets$/,
      );
      if (assetCollectionMatch && request.method === "POST") {
        const filename = url.searchParams.get("filename") ?? "";
        const imported = await store.importAssetStream(
          decodeURIComponent(assetCollectionMatch[1]),
          filename,
          request,
          config.limits.maxAssetBytes,
        );
        json(response, 201, imported);
        return;
      }

      if (route && route.asset && request.method === "GET") {
        const assetPath = store.assetPath(route.id, route.asset);
        await access(assetPath);
        const info = await stat(assetPath);
        if (!info.isFile()) throw new Error("Asset is not a file");
        let range;
        try {
          range = parseByteRange(request.headers.range, info.size);
        } catch {
          response.writeHead(416, {
            "content-range": `bytes */${info.size}`,
            "accept-ranges": "bytes",
          });
          response.end();
          return;
        }
        const contentLength = range ? range.end - range.start + 1 : info.size;
        response.writeHead(range ? 206 : 200, {
          "content-type":
            contentTypes[extname(assetPath).toLowerCase()] ??
            "application/octet-stream",
          "content-length": contentLength,
          ...(range
            ? {
                "content-range": `bytes ${range.start}-${range.end}/${info.size}`,
              }
            : {}),
          "accept-ranges": "bytes",
          "cache-control": "no-cache",
        });
        const stream = createReadStream(
          assetPath,
          range ? { start: range.start, end: range.end } : undefined,
        );
        stream.on("error", (cause) => response.destroy(cause));
        stream.pipe(response);
        return;
      }

      if (route && !route.asset && request.method === "GET") {
        json(response, 200, await store.read(route.id));
        return;
      }

      if (route && !route.asset && request.method === "PUT") {
        json(
          response,
          200,
          await store.save(
            route.id,
            await readJson(request, config.limits.maxBodyBytes),
          ),
        );
        return;
      }

      if (route && !route.asset && request.method === "DELETE") {
        await store.archive(route.id);
        response.writeHead(204, { "cache-control": "no-store" });
        response.end();
        return;
      }

      const canonicalPath = canonicalizeRequestPath(url.pathname);
      const isApiPath =
        canonicalPath === "/api" || canonicalPath?.startsWith("/api/");
      if (
        config.editorDirectory !== null &&
        !isApiPath &&
        (request.method === "GET" || request.method === "HEAD")
      ) {
        if (canonicalPath === null) {
          staticNotFound(response);
          return;
        }
        const immutablePaths = await immutableEditorPaths;
        const exactPath = canonicalPath === "/" ? "/index.html" : canonicalPath;
        const exactResult = await serveEditorFile(
          request,
          response,
          config.editorDirectory,
          exactPath,
          {
            beforeIdentityCheck: internal.testOnlyBeforeStaticIdentityCheck,
            afterOpen: internal.testOnlyAfterStaticOpen,
            immutablePaths,
          },
        );
        if (exactResult === "served") return;
        if (exactResult === "rejected") {
          staticNotFound(response);
          return;
        }
        if (
          extname(canonicalPath) === "" &&
          (await serveEditorFile(
            request,
            response,
            config.editorDirectory,
            "/index.html",
            {
              beforeIdentityCheck: internal.testOnlyBeforeStaticIdentityCheck,
              afterOpen: internal.testOnlyAfterStaticOpen,
              immutablePaths,
            },
          )) === "served"
        )
          return;
        staticNotFound(response);
        return;
      }

      json(response, 404, { error: "Not found" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error";
      const status =
        message.includes("not found") || message.includes("ENOENT") ? 404 : 400;
      json(response, status, { error: message });
    }
  });
  return server;
}
