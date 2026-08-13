import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  parsePublicationManifest,
  type PublicationManifest,
} from "@earth-stories/story-schema";
import { inventoryBasemapStyleResources } from "./dependencies.js";
import { SHARE_POST_TEXT_PATH } from "./share.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface ChapterVerification {
  chapterId: string;
  ready: boolean;
  detail?: string;
}

export interface BrowserVerificationRequest {
  origin: string;
  entrypoint: "index.html" | "embed.html";
  expectedChapterIds: string[];
  readinessRequiredChapterIds: string[];
  timeoutMs: number;
}

export interface BrowserVerificationResult {
  attemptedOutsideOrigin: string[];
  runtimeErrors: string[];
  chapterReadiness: ChapterVerification[];
  webgl: boolean;
}

export type PublicationBrowserVerifier = (
  request: BrowserVerificationRequest,
) => Promise<BrowserVerificationResult>;

export interface PublicationVerification {
  verifiedAt: string;
  buildId: string;
  checkedFiles: number;
  includedAssets: number;
  status: "passed" | "failed";
  reasonCode?: string;
  failures: string[];
  attemptedOutsideOrigin: string[];
  runtimeErrors: string[];
  chapterReadiness: ChapterVerification[];
  rangeChecks: Array<{
    dependencyId: string;
    status: number;
    contentRange: string | null;
  }>;
  artifacts: Array<{
    kind: "folder" | "embed" | "archive";
    entrypoint: "index.html" | "embed.html" | "archival.html";
    status: "passed" | "failed";
  }>;
}

export interface VerifyPublicationOptions {
  requireEmbed?: boolean;
  requireShareKit?: boolean;
  browserVerifier?: PublicationBrowserVerifier;
  timeoutMs?: number;
}

export class PublicationVerificationError extends Error {
  constructor(readonly report: PublicationVerification) {
    super(`Publication verification failed: ${report.failures.join("; ")}`);
    this.name = "PublicationVerificationError";
  }
}

function isContained(root: string, target: string): boolean {
  const child = relative(root, target);
  return (
    child === "" ||
    (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child))
  );
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

function sanitizeText(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/giu, (url) => sanitizeUrl(url));
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function checkedFile(
  directory: string,
  href: string,
  label: string,
  failures: string[],
): Promise<string | null> {
  const root = resolve(directory);
  const path = resolve(root, href);
  if (!isContained(root, path)) {
    failures.push(`${label} escapes the release folder`);
    return null;
  }
  try {
    const linkInfo = await lstat(path);
    const target = await realpath(path);
    const canonicalRoot = await realpath(root);
    if (!isContained(canonicalRoot, target)) {
      failures.push(`${label} links outside the release folder`);
      return null;
    }
    const info = await stat(target);
    if (!linkInfo.isFile() && !linkInfo.isSymbolicLink()) {
      failures.push(`${label} is not a file`);
      return null;
    }
    if (!info.isFile()) {
      failures.push(`${label} is not a file`);
      return null;
    }
    if (info.size === 0) {
      failures.push(`${label} is empty`);
      return null;
    }
    return target;
  } catch {
    failures.push(`${label} is missing`);
    return null;
  }
}

function styleResourceHref(styleHref: string, locator: string): string | null {
  if (/^[a-z][a-z\d+.-]*:/iu.test(locator) || locator.startsWith("//"))
    return null;
  const base = new URL(styleHref, "https://offline.invalid/");
  const resolved = new URL(locator, base);
  return resolved.origin === base.origin
    ? decodeURIComponent(resolved.pathname.replace(/^\//u, ""))
    : null;
}

async function writeReport(
  directory: string,
  report: PublicationVerification,
): Promise<void> {
  const destination = join(directory, "publication-verification.json");
  const temporary = `${destination}.partial-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, {
      flag: "wx",
    });
    await import("node:fs/promises").then(({ rename }) =>
      rename(temporary, destination),
    );
  } finally {
    await rm(temporary, { force: true });
  }
}

function parseRange(header: string | undefined, size: number) {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/u);
  if (!match || (!match[1] && !match[2]) || size <= 0) return undefined;
  if (!match[1]) {
    const length = Number(match[2]);
    if (!Number.isSafeInteger(length) || length <= 0) return undefined;
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  )
    return undefined;
  return { start, end: Math.min(requestedEnd, size - 1) };
}

async function startVerificationServer(directory: string): Promise<{
  origin: string;
  server: Server;
}> {
  const canonicalRoot = await realpath(directory);
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405).end();
        return;
      }
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      let pathname: string;
      try {
        pathname = decodeURIComponent(requestUrl.pathname);
      } catch {
        response.writeHead(400).end();
        return;
      }
      if (pathname === "/") pathname = "/index.html";
      if (pathname === "/favicon.ico") {
        response.writeHead(204, { "cache-control": "no-store" }).end();
        return;
      }
      if (pathname.includes("\\") || pathname.includes("\0")) {
        response.writeHead(404).end();
        return;
      }
      const candidate = resolve(canonicalRoot, pathname.replace(/^\/+/, ""));
      if (!isContained(canonicalRoot, candidate)) {
        response.writeHead(404).end();
        return;
      }
      const target = await realpath(candidate);
      if (!isContained(canonicalRoot, target)) {
        response.writeHead(404).end();
        return;
      }
      const bytes = await readFile(target);
      const range = parseRange(request.headers.range, bytes.byteLength);
      if (range === undefined) {
        response
          .writeHead(416, { "content-range": `bytes */${bytes.byteLength}` })
          .end();
        return;
      }
      const body = range ? bytes.subarray(range.start, range.end + 1) : bytes;
      response.writeHead(range ? 206 : 200, {
        "accept-ranges": "bytes",
        "cache-control": "no-store",
        "content-length": body.byteLength,
        "content-type":
          MIME_TYPES[extname(target).toLowerCase()] ??
          "application/octet-stream",
        ...(range
          ? {
              "content-range": `bytes ${range.start}-${range.end}/${bytes.byteLength}`,
            }
          : {}),
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Verification server did not bind a loopback port");
  return { origin: `http://127.0.0.1:${address.port}`, server };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

class CdpClient {
  #nextId = 0;
  #pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (cause: Error) => void }
  >();
  readonly events: Array<(message: any) => void> = [];

  constructor(readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id === "number") {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        for (const listener of this.events) listener(message);
      }
    });
  }

  send(method: string, params: Record<string, unknown> = {}) {
    const id = ++this.#nextId;
    return new Promise<any>((resolveSend, reject) => {
      this.#pending.set(id, { resolve: resolveSend, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function openCdp(url: string): Promise<CdpClient> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolveOpen, reject) => {
    socket.addEventListener("open", () => resolveOpen(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("Chrome debugging socket failed")),
      { once: true },
    );
  });
  return new CdpClient(socket);
}

async function waitForDebugger(
  chrome: ChildProcess,
  profileDirectory: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + Math.min(timeoutMs, 20_000);
  let stderr = "";
  chrome.stderr?.setEncoding("utf8");
  chrome.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null)
      throw new Error(`Chrome exited before startup (${chrome.exitCode})`);
    try {
      const [port, path] = (
        await readFile(join(profileDirectory, "DevToolsActivePort"), "utf8")
      )
        .trim()
        .split(/\r?\n/u);
      if (port && path) return `ws://127.0.0.1:${port}${path}`;
    } catch {
      // Chrome has not created its debugging endpoint yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Chrome debugging endpoint timed out: ${stderr.slice(-500)}`);
}

async function stopBrowser(chrome: ChildProcess): Promise<void> {
  if (chrome.exitCode !== null) return;
  const exited = new Promise<void>((resolveExit) =>
    chrome.once("exit", () => resolveExit()),
  );
  try {
    if (process.platform !== "win32" && chrome.pid)
      process.kill(-chrome.pid, "SIGTERM");
    else chrome.kill("SIGTERM");
  } catch {
    return;
  }
  if (
    !(await Promise.race([
      exited.then(() => true),
      new Promise<false>((resolveWait) =>
        setTimeout(() => resolveWait(false), 3_000),
      ),
    ]))
  ) {
    try {
      if (process.platform !== "win32" && chrome.pid)
        process.kill(-chrome.pid, "SIGKILL");
      else chrome.kill("SIGKILL");
    } catch {
      // The browser exited between signals.
    }
    await exited;
  }
}

export const verifyPublicationInChrome: PublicationBrowserVerifier = async (
  request,
) => {
  const profileDirectory = await mkdtemp(
    join(tmpdir(), "earth-stories-verification-profile-"),
  );
  const executable = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
  const xvfbExecutable = "/usr/bin/xvfb-run";
  await access(executable);
  const useXvfb =
    process.platform === "linux" &&
    (await access(xvfbExecutable).then(
      () => true,
      () => false,
    ));
  const chromeArguments = [
    ...(useXvfb ? [] : ["--headless=new"]),
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--metrics-recording-only",
    "--no-first-run",
    "--remote-debugging-port=0",
    "--use-angle=swiftshader",
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ];
  const chrome = spawn(
    useXvfb ? xvfbExecutable : executable,
    useXvfb ? ["-a", executable, ...chromeArguments] : chromeArguments,
    {
      detached: process.platform !== "win32",
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  try {
    const browserSocket = await waitForDebugger(
      chrome,
      profileDirectory,
      request.timeoutMs,
    );
    const browser = await openCdp(browserSocket);
    const host = new URL(browserSocket).host;
    const page = await fetch(`http://${host}/json/new?about:blank`, {
      method: "PUT",
    }).then(
      (response) =>
        response.json() as Promise<{ webSocketDebuggerUrl: string }>,
    );
    browser.socket.close();
    const cdp = await openCdp(page.webSocketDebuggerUrl);
    const attemptedOutsideOrigin: string[] = [];
    const runtimeErrors: string[] = [];
    cdp.events.push((message) => {
      if (message.method === "Fetch.requestPaused") {
        const requestUrl = String(message.params.request.url);
        let allowed = false;
        try {
          const parsed = new URL(requestUrl);
          allowed =
            parsed.origin === request.origin ||
            parsed.protocol === "data:" ||
            parsed.protocol === "blob:" ||
            parsed.protocol === "about:";
        } catch {
          // Malformed requests are denied.
        }
        void cdp.send(
          allowed ? "Fetch.continueRequest" : "Fetch.failRequest",
          allowed
            ? { requestId: message.params.requestId }
            : {
                requestId: message.params.requestId,
                errorReason: "BlockedByClient",
              },
        );
        if (!allowed) attemptedOutsideOrigin.push(sanitizeUrl(requestUrl));
      }
      if (message.method === "Runtime.exceptionThrown")
        runtimeErrors.push(
          sanitizeText(
            message.params.exceptionDetails.exception?.description ??
              message.params.exceptionDetails.text,
          ),
        );
      if (
        message.method === "Log.entryAdded" &&
        message.params.entry.level === "error"
      )
        runtimeErrors.push(sanitizeText(message.params.entry.text));
    });
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Log.enable"),
      cdp.send("Network.enable", { maxTotalBufferSize: 0 }),
      cdp.send("Network.setCacheDisabled", { cacheDisabled: true }),
      cdp.send("Network.setBypassServiceWorker", { bypass: true }),
      cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }),
    ]);
    await cdp.send("Page.navigate", {
      url: `${request.origin}/${request.entrypoint}`,
    });
    const deadline = Date.now() + request.timeoutMs;
    const required = JSON.stringify(request.readinessRequiredChapterIds);
    let chapterReadiness: ChapterVerification[] = [];
    let chapterIndex = 0;
    let webgl = false;
    while (Date.now() < deadline) {
      const state = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const expected = ${JSON.stringify(request.expectedChapterIds)};
          const required = new Set(${required});
          return {
            webgl: Boolean(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')),
            chapters: expected.map((chapterId) => {
            const node = document.querySelector('[data-chapter-id="' + CSS.escape(chapterId) + '"]');
            const marker = node?.matches('[data-map-ready]') ? node : node?.querySelector('[data-map-ready]');
            const markerState = marker?.getAttribute('data-map-ready');
            return { chapterId, ready: Boolean(node) && (!required.has(chapterId) || markerState === 'true'), detail: node ? (required.has(chapterId) && markerState !== 'true' ? 'map readiness: ' + String(markerState) : undefined) : 'chapter element missing' };
            })
          };
        })()`,
        returnByValue: true,
      });
      chapterReadiness = state.result.value?.chapters ?? [];
      webgl = state.result.value?.webgl === true;
      if (
        chapterReadiness.length === request.expectedChapterIds.length &&
        chapterReadiness.every(({ ready }) => ready)
      )
        break;
      await cdp.send("Runtime.evaluate", {
        expression: `document.querySelectorAll('[data-chapter-id]')[${chapterIndex}]?.scrollIntoView({block:'center'})`,
      });
      chapterIndex =
        (chapterIndex + 1) % Math.max(1, request.expectedChapterIds.length);
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    cdp.socket.close();
    return { attemptedOutsideOrigin, runtimeErrors, chapterReadiness, webgl };
  } finally {
    await stopBrowser(chrome);
    await rm(profileDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
};

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Offline browser verification timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function verifyPublication(
  directory: string,
  expected: PublicationManifest,
  options: VerifyPublicationOptions = {},
): Promise<PublicationVerification> {
  const required = [
    "index.html",
    "publication.json",
    "archival.html",
    "publication-report.html",
    "README.txt",
    ...(options.requireEmbed ? ["embed.html", "EMBED.txt"] : []),
    ...(options.requireShareKit ? [SHARE_POST_TEXT_PATH] : []),
  ];
  const failures: string[] = [];
  const attemptedOutsideOrigin: string[] = [];
  const runtimeErrors: string[] = [];
  const chapterReadiness: ChapterVerification[] = [];
  const rangeChecks: PublicationVerification["rangeChecks"] = [];
  const artifacts: PublicationVerification["artifacts"] = [];
  for (const filename of required)
    await checkedFile(directory, filename, filename, failures);

  let manifest: PublicationManifest | null = null;
  try {
    manifest = parsePublicationManifest(
      JSON.parse(await readFile(join(directory, "publication.json"), "utf8")),
    );
    if (JSON.stringify(manifest) !== JSON.stringify(expected))
      failures.push("publication.json does not match the current build");
  } catch {
    failures.push("publication.json is not a valid publication manifest");
  }

  const candidate = manifest ?? expected;
  const included = candidate.dependencies.filter(
    (dependency) => dependency.delivery === "included",
  );
  if (candidate.publication.profile === "offline") {
    if (candidate.connectivity.requested !== "offline")
      failures.push(
        "offline manifest has a contradictory connectivity request",
      );
    if (candidate.externalDependencies.length)
      failures.push("offline manifest declares external dependencies");
    if (
      candidate.dependencies.some(
        (dependency) =>
          dependency.delivery !== "included" ||
          dependency.requirements.some(
            (requirement) => requirement === ("network" as string),
          ),
      )
    )
      failures.push("offline manifest contains a runtime network dependency");
  }

  const verifiedPaths = new Map<string, string>();
  for (const dependency of included) {
    const path = await checkedFile(
      directory,
      dependency.locator,
      `included dependency “${dependency.id}”`,
      failures,
    );
    if (!path) continue;
    verifiedPaths.set(dependency.locator, path);
    if ((await sha256File(path)) !== dependency.sha256)
      failures.push(
        `included dependency “${dependency.id}” has the wrong SHA-256`,
      );
  }

  for (const asset of candidate.assets.filter(
    (candidate) => candidate.delivery === "included",
  )) {
    if (!included.some(({ locator }) => locator === asset.href))
      failures.push(
        `included asset “${asset.label}” has no integrity dependency`,
      );
  }
  for (const runtime of candidate.runtimeAssets) {
    const dependency = included.find(({ locator }) => locator === runtime.href);
    if (!dependency || dependency.sha256 !== runtime.sha256)
      failures.push(
        `runtime asset “${runtime.id}” has no matching integrity dependency`,
      );
  }

  if (candidate.basemap.delivery === "included") {
    const styleHref = candidate.basemap.styleHref;
    const styleDependency = included.find(
      ({ locator }) => locator === styleHref,
    );
    const stylePath = verifiedPaths.get(styleHref);
    if (!styleDependency || !stylePath) {
      failures.push("included neutral style has no integrity dependency");
    } else {
      try {
        const resources = inventoryBasemapStyleResources(
          JSON.parse(await readFile(stylePath, "utf8")),
        );
        for (const locator of resources) {
          const href = styleResourceHref(styleHref, locator);
          if (!href) {
            failures.push(`neutral style resource “${locator}” is not local`);
            continue;
          }
          if (!included.some((dependency) => dependency.locator === href))
            failures.push(`neutral style resource “${locator}” is undeclared`);
        }
      } catch {
        failures.push("neutral style is not valid JSON");
      }
    }
  }

  let server: Server | null = null;
  try {
    if (failures.length === 0 && candidate.publication.profile === "offline") {
      const started = await startVerificationServer(directory);
      server = started.server;
      for (const dependency of included.filter(({ requirements }) =>
        requirements.includes("byte-ranges"),
      )) {
        const response = await fetch(
          new URL(dependency.locator, `${started.origin}/`),
          { headers: { range: "bytes=0-0" } },
        );
        const contentRange = response.headers.get("content-range");
        rangeChecks.push({
          dependencyId: dependency.id,
          status: response.status,
          contentRange,
        });
        if (
          response.status !== 206 ||
          !contentRange?.match(/^bytes 0-0\/\d+$/u) ||
          (await response.arrayBuffer()).byteLength !== 1
        )
          failures.push(
            `byte-range verification failed for “${dependency.id}”`,
          );
      }

      const verifier = options.browserVerifier ?? verifyPublicationInChrome;
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const entrypoints: Array<"index.html" | "embed.html"> = [
        "index.html",
        ...(options.requireEmbed ? (["embed.html"] as const) : []),
      ];
      for (const entrypoint of entrypoints) {
        const result = await withTimeout(
          verifier({
            origin: started.origin,
            entrypoint,
            expectedChapterIds: candidate.chapters.map(({ id }) => id),
            readinessRequiredChapterIds: candidate.chapters.flatMap(
              (chapter) =>
                chapter.type === "map" ||
                chapter.type === "scrolly" ||
                chapter.type === "flyover"
                  ? [chapter.id]
                  : [],
            ),
            timeoutMs,
          }),
          timeoutMs,
        );
        attemptedOutsideOrigin.push(
          ...result.attemptedOutsideOrigin.map(sanitizeUrl),
        );
        runtimeErrors.push(...result.runtimeErrors.map(sanitizeText));
        chapterReadiness.push(...result.chapterReadiness);
        const expectedIds = new Set(candidate.chapters.map(({ id }) => id));
        const readyIds = new Set(
          result.chapterReadiness
            .filter(({ ready }) => ready)
            .map(({ chapterId }) => chapterId),
        );
        const artifactPassed =
          result.attemptedOutsideOrigin.length === 0 &&
          result.runtimeErrors.length === 0 &&
          result.webgl &&
          [...expectedIds].every((id) => readyIds.has(id));
        artifacts.push({
          kind: entrypoint === "index.html" ? "folder" : "embed",
          entrypoint,
          status: artifactPassed ? "passed" : "failed",
        });
        if (result.attemptedOutsideOrigin.length)
          failures.push(`${entrypoint} attempted an outside-origin request`);
        if (result.runtimeErrors.length)
          failures.push(`${entrypoint} reported browser runtime errors`);
        if (!result.webgl)
          failures.push(`${entrypoint} did not obtain a WebGL context`);
        if (![...expectedIds].every((id) => readyIds.has(id)))
          failures.push(`${entrypoint} did not hydrate every chapter`);
      }
    }
  } catch (cause) {
    failures.push(
      cause instanceof Error
        ? sanitizeText(cause.message)
        : "browser verification failed",
    );
  } finally {
    if (server) await closeServer(server);
  }
  artifacts.push({
    kind: "archive",
    entrypoint: "archival.html",
    status: failures.some((failure) => failure.startsWith("archival.html"))
      ? "failed"
      : "passed",
  });

  const report: PublicationVerification = {
    verifiedAt: new Date().toISOString(),
    buildId: candidate.build.id,
    checkedFiles: required.length + included.length,
    includedAssets: candidate.assets.filter(
      (asset) => asset.delivery === "included",
    ).length,
    status: failures.length ? "failed" : "passed",
    ...(failures.length ? { reasonCode: "verification-failed" } : {}),
    failures,
    attemptedOutsideOrigin: [...new Set(attemptedOutsideOrigin)],
    runtimeErrors: [...new Set(runtimeErrors)],
    chapterReadiness,
    rangeChecks,
    artifacts,
  };
  await writeReport(directory, report);
  if (failures.length) throw new PublicationVerificationError(report);
  return report;
}
