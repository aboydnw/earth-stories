import { open, realpath, type FileHandle } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
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

function cacheControl(path: string): string {
  const filename = basename(path);
  if (filename === "index.html") return "no-store";
  return /(?:^|[.-])[A-Za-z0-9_-]{8}(?=\.)/.test(filename)
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
  internal: { afterOpen?: (path: string) => Promise<void> } = {},
): Promise<"served" | "missing" | "rejected"> {
  if (request.method !== "GET" && request.method !== "HEAD") return "missing";
  let root: string;
  let candidate: string;
  let handle: FileHandle | null = null;
  try {
    root = await realpath(editorDirectory);
    candidate = resolve(root, pathname.replace(/^\/+/, ""));
    if (!contained(root, candidate)) return "rejected";
    handle = await open(candidate, "r");
    if (process.platform !== "linux") {
      await handle.close();
      return "rejected";
    }
    const openedPath = await realpath(`/proc/self/fd/${handle.fd}`);
    if (!contained(root, openedPath)) {
      await handle.close();
      return "rejected";
    }
    await internal.afterOpen?.(candidate);
  } catch (cause) {
    await handle?.close().catch(() => undefined);
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
    await handle.close().catch(() => undefined);
    return "missing";
  }
  const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
  const headers: Record<string, string | number> = {
    "content-type":
      MIME_TYPES[extname(candidate).toLowerCase()] ??
      "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": cacheControl(candidate),
    etag,
  };
  if (matchesEtag(request.headers["if-none-match"], etag)) {
    response.writeHead(304, headers);
    response.end();
    await handle.close().catch(() => undefined);
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
    await handle.close().catch(() => undefined);
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
    await handle.close().catch(() => undefined);
    return "served";
  }
  let closed = false;
  const closeHandle = () => {
    if (closed) return;
    closed = true;
    void handle.close().catch(() => undefined);
  };
  const stream = handle.createReadStream({
    ...(range ? { start: range.start, end: range.end } : {}),
    autoClose: false,
  });
  response.once("finish", closeHandle);
  response.once("close", closeHandle);
  response.once("error", closeHandle);
  stream.once("error", (cause) => {
    closeHandle();
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
