import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
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

function decodePath(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded.includes("\0") || decoded.includes("\\") ? null : decoded;
  } catch {
    return null;
  }
}

export function isSafeEditorPath(pathname: string): boolean {
  const decoded = decodePath(pathname);
  return (
    decoded !== null && !decoded.split("/").some((segment) => segment === "..")
  );
}

function cacheControl(path: string): string {
  const filename = basename(path);
  if (filename === "index.html") return "no-store";
  return /(?:^|[.-])[a-f0-9]{8,}(?=[.-])/i.test(filename)
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
): Promise<boolean> {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const decoded = decodePath(pathname);
  if (decoded === null) return false;

  let root: string;
  let target: string;
  try {
    root = await realpath(editorDirectory);
    const candidate = resolve(root, decoded.replace(/^\/+/, ""));
    if (!contained(root, candidate)) return false;
    target = await realpath(candidate);
    if (!contained(root, target)) return false;
  } catch {
    return false;
  }

  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) return false;
  const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
  const headers: Record<string, string | number> = {
    "content-type":
      MIME_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": cacheControl(target),
    etag,
  };
  if (matchesEtag(request.headers["if-none-match"], etag)) {
    response.writeHead(304, headers);
    response.end();
    return true;
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
    return true;
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
    return true;
  }
  const stream = createReadStream(
    target,
    range ? { start: range.start, end: range.end } : undefined,
  );
  stream.once("error", (cause) => response.destroy(cause));
  stream.pipe(response);
  return true;
}

export function staticNotFound(response: ServerResponse): void {
  response.writeHead(404, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end("Not found\n");
}
