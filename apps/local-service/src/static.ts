import {
  open,
  readFile,
  realpath,
  stat,
  type FileHandle,
} from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { parseByteRange } from "./range.js";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
};

function contained(root: string, target: string): boolean {
  const child = relative(root, target);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

interface FileIdentity {
  dev: bigint;
  ino: bigint;
  isFile(): boolean;
}

export function isSameOpenedFile(
  opened: FileIdentity,
  resolved: FileIdentity,
): boolean {
  return (
    opened.isFile() &&
    resolved.isFile() &&
    opened.dev === resolved.dev &&
    opened.ino === resolved.ino
  );
}

export function canonicalizeRequestPath(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    if (
      decoded.includes("\0") ||
      decoded.includes("\\") ||
      /%(?:25|2e|2f|5c)/i.test(decoded) ||
      decoded.split("/").some((segment) => segment === "..")
    )
      return null;
    return decoded;
  } catch {
    return null;
  }
}

function normalizedOutputPath(value: unknown): string | null {
  if (typeof value !== "string" || value.includes("\\")) return null;
  const normalized = posix.normalize(value.replace(/^\/+/, ""));
  return normalized === "." || normalized.startsWith("../") ? null : normalized;
}

export async function loadImmutableEditorPaths(
  editorDirectory: string,
): Promise<ReadonlySet<string>> {
  try {
    const parsed = JSON.parse(
      await readFile(join(editorDirectory, ".vite", "manifest.json"), "utf8"),
    ) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return new Set();
    const outputs = new Set<string>();
    for (const entry of Object.values(parsed)) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry))
        continue;
      const record = entry as Record<string, unknown>;
      for (const value of [record.file]) {
        const path = normalizedOutputPath(value);
        if (path) outputs.add(path);
      }
      for (const field of [record.css, record.assets]) {
        if (!Array.isArray(field)) continue;
        for (const value of field) {
          const path = normalizedOutputPath(value);
          if (path) outputs.add(path);
        }
      }
    }
    return outputs;
  } catch {
    return new Set();
  }
}

function cacheControl(
  pathname: string,
  immutablePaths: ReadonlySet<string>,
): string {
  const normalized = pathname.replace(/^\/+/, "");
  if (normalized === "index.html") return "no-store";
  return immutablePaths.has(normalized)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

function matchesEtag(header: string | undefined, etag: string): boolean {
  return (
    header === "*" ||
    header
      ?.split(",")
      .map((value) => value.trim())
      .includes(etag) === true
  );
}

export async function serveEditorFile(
  request: IncomingMessage,
  response: ServerResponse,
  editorDirectory: string,
  pathname: string,
  internal: {
    beforeIdentityCheck?: (path: string) => Promise<void>;
    afterOpen?: (path: string) => Promise<void>;
    immutablePaths?: ReadonlySet<string>;
  } = {},
): Promise<"served" | "missing" | "rejected"> {
  if (request.method !== "GET" && request.method !== "HEAD") return "missing";
  let root: string;
  let candidate: string;
  let handle: FileHandle | null = null;
  let closed = false;
  const closeHandle = async () => {
    if (closed || handle === null) return;
    closed = true;
    await handle.close().catch(() => undefined);
  };
  try {
    root = await realpath(editorDirectory);
    candidate = resolve(root, pathname.replace(/^\/+/, ""));
    if (!contained(root, candidate)) return "rejected";
    handle = await open(candidate, "r");
    const openedInfo = await handle.stat({ bigint: true });
    await internal.beforeIdentityCheck?.(candidate);
    const resolvedPath = await realpath(candidate);
    if (!contained(root, resolvedPath)) {
      await closeHandle();
      return "rejected";
    }
    const resolvedInfo = await stat(resolvedPath, { bigint: true });
    if (!isSameOpenedFile(openedInfo, resolvedInfo)) {
      await closeHandle();
      return "rejected";
    }
    await internal.afterOpen?.(candidate);
  } catch (cause) {
    await closeHandle();
    return handle === null &&
      typeof cause === "object" &&
      cause !== null &&
      "code" in cause &&
      (cause.code === "ENOENT" || cause.code === "ENOTDIR")
      ? "missing"
      : "rejected";
  }

  const info = await handle.stat().catch(() => null);
  if (!info?.isFile()) {
    await closeHandle();
    return "missing";
  }
  const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
  const headers: Record<string, string | number> = {
    "content-type":
      MIME_TYPES[extname(candidate).toLowerCase()] ??
      "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": cacheControl(
      pathname,
      internal.immutablePaths ?? new Set(),
    ),
    etag,
  };
  if (matchesEtag(request.headers["if-none-match"], etag)) {
    response.writeHead(304, headers);
    response.end();
    await closeHandle();
    return "served";
  }

  let range;
  try {
    range = parseByteRange(request.headers.range, info.size);
  } catch {
    response.writeHead(416, {
      ...headers,
      "content-range": `bytes */${info.size}`,
    });
    response.end();
    await closeHandle();
    return "served";
  }
  const contentLength = range ? range.end - range.start + 1 : info.size;
  response.writeHead(range ? 206 : 200, {
    ...headers,
    "content-length": contentLength,
    ...(range
      ? { "content-range": `bytes ${range.start}-${range.end}/${info.size}` }
      : {}),
  });
  if (request.method === "HEAD") {
    response.end();
    await closeHandle();
    return "served";
  }
  const stream = handle.createReadStream({
    ...(range ? { start: range.start, end: range.end } : {}),
    autoClose: false,
  });
  const closeStreamHandle = () => void closeHandle();
  response.once("finish", closeStreamHandle);
  response.once("close", closeStreamHandle);
  response.once("error", closeStreamHandle);
  stream.once("error", (cause) => {
    closeStreamHandle();
    response.destroy(cause);
  });
  stream.pipe(response);
  return "served";
}

export function staticNotFound(response: ServerResponse): void {
  response.writeHead(404, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end("Not found\n");
}
