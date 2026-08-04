import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, join, relative, resolve } from "node:path";
import { ProjectStore } from "@earth-stories/project-store";
import {
  buildLatestPublication,
  createEmbedSnippet,
  preflightPublication,
} from "@earth-stories/publisher";
import { Zip, ZipDeflate } from "fflate";

const HOST = "127.0.0.1";
const PORT = Number(process.env.EARTH_STORIES_PORT ?? 4317);
const PROJECTS_DIRECTORY = resolve(
  process.env.EARTH_STORIES_PROJECTS_DIR ?? "./earth-stories-projects",
);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 100 * 1024 * 1024;
const MAX_EXPORT_BODY_BYTES = 50 * 1024 * 1024;
const VIEWER_DIRECTORY = resolve(
  process.env.EARTH_STORIES_VIEWER_DIR ?? "./dist/viewer",
);

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

async function readJson(request: IncomingMessage): Promise<unknown> {
  return JSON.parse(
    (await readBody(request, MAX_BODY_BYTES)).toString("utf8"),
  ) as unknown;
}

async function readOptionalJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const body = await readBody(request, MAX_EXPORT_BODY_BYTES);
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

const exportLocks = new Map<string, Promise<void>>();
async function withProjectExportLock<T>(
  projectId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = exportLocks.get(projectId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveLock) => {
    release = resolveLock;
  });
  const tail = previous.then(() => current);
  exportLocks.set(projectId, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (exportLocks.get(projectId) === tail) exportLocks.delete(projectId);
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

export function createLocalServer(store: ProjectStore) {
  return createServer(async (request, response) => {
    response.setHeader("x-content-type-options", "nosniff");
    const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        json(response, 200, { status: "ready", projectsDirectory: store.root });
        return;
      }

      if (url.pathname === "/api/projects" && request.method === "GET") {
        json(response, 200, await store.list());
        return;
      }

      if (url.pathname === "/api/projects" && request.method === "POST") {
        const body = (await readJson(request)) as {
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
      const exportMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/export$/,
      );
      if (exportMatch && request.method === "POST") {
        const id = decodeURIComponent(exportMatch[1]);
        const format = url.searchParams.get("format") ?? "zip";
        if (!["zip", "folder", "archive", "embed"].includes(format))
          throw new Error("Unknown export format");
        await access(join(VIEWER_DIRECTORY, "index.html"));
        const body = await readOptionalJson(request);
        const snapshots =
          typeof body.mapSnapshots === "object" && body.mapSnapshots !== null
            ? (body.mapSnapshots as Record<string, string>)
            : undefined;
        await withProjectExportLock(id, async () => {
          const latest = await buildLatestPublication({
            projectDirectory: store.projectPath(id),
            viewerDirectory: VIEWER_DIRECTORY,
            mapSnapshots: snapshots,
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
            const publicationUrl =
              typeof body.publicationUrl === "string" &&
              body.publicationUrl.trim()
                ? body.publicationUrl.trim()
                : "{{PUBLICATION_URL}}";
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
        const imported = await store.importAsset(
          decodeURIComponent(assetCollectionMatch[1]),
          filename,
          await readBody(request, MAX_ASSET_BYTES),
        );
        json(response, 201, imported);
        return;
      }

      if (route && route.asset && request.method === "GET") {
        const assetPath = store.assetPath(route.id, route.asset);
        await access(assetPath);
        const info = await stat(assetPath);
        if (!info.isFile()) throw new Error("Asset is not a file");
        response.writeHead(200, {
          "content-type":
            contentTypes[extname(assetPath).toLowerCase()] ??
            "application/octet-stream",
          "content-length": info.size,
          "accept-ranges": "bytes",
          "cache-control": "no-cache",
        });
        createReadStream(assetPath).pipe(response);
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
          await store.save(route.id, await readJson(request)),
        );
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
}

const store = new ProjectStore(PROJECTS_DIRECTORY);
await store.initialize();
const server = createLocalServer(store);
server.listen(PORT, HOST, () => {
  process.stdout.write(
    `Earth Stories local service ready at http://${HOST}:${PORT}\nProjects: ${PROJECTS_DIRECTORY}\n`,
  );
});

function stop(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
