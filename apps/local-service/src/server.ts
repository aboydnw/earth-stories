import { createReadStream } from "node:fs";
import { access, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ProjectStore } from "@earth-stories/project-store";
import { buildPublication } from "@earth-stories/publisher";
import { zipSync } from "fflate";

const HOST = "127.0.0.1";
const PORT = Number(process.env.EARTH_STORIES_PORT ?? 4317);
const PROJECTS_DIRECTORY = resolve(
  process.env.EARTH_STORIES_PROJECTS_DIR ?? "./earth-stories-projects",
);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 100 * 1024 * 1024;
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

async function collectFiles(
  directory: string,
  root = directory,
): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      Object.assign(files, await collectFiles(path, root));
    else if (entry.isFile())
      files[relative(root, path).replaceAll("\\", "/")] = await readFile(path);
  }
  return files;
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
      const exportMatch = url.pathname.match(
        /^\/api\/projects\/([^/]+)\/export$/,
      );
      if (exportMatch && request.method === "POST") {
        const id = decodeURIComponent(exportMatch[1]);
        await access(join(VIEWER_DIRECTORY, "index.html"));
        const temporaryRoot = await mkdtemp(
          join(tmpdir(), "earth-stories-export-"),
        );
        const outputDirectory = join(temporaryRoot, id);
        try {
          const manifest = await buildPublication({
            projectDirectory: store.projectPath(id),
            outputDirectory,
            viewerDirectory: VIEWER_DIRECTORY,
          });
          const archive = zipSync(await collectFiles(outputDirectory), {
            level: 6,
          });
          response.writeHead(200, {
            "content-type": "application/zip",
            "content-disposition": `attachment; filename="${id}-${manifest.build.id}.zip"`,
            "content-length": archive.byteLength,
            "cache-control": "no-store",
          });
          response.end(archive);
        } finally {
          await rm(temporaryRoot, { recursive: true, force: true });
        }
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
