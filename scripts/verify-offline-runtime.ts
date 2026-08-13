import { spawn } from "node:child_process";
import { access, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  serveEditorFile,
  staticNotFound,
} from "../apps/local-service/src/static.js";

const TIMEOUT_MS = 60_000;
const chromeExecutable = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const xvfbExecutable = "/usr/bin/xvfb-run";

const provenance = {
  publisher: "Earth Stories acceptance fixture",
  sourceUrl: null,
  licenseName: null,
  licenseUrl: null,
  dataUpdatedAt: null,
  accessedAt: null,
  staleAfterDays: null,
  temporalCoverage: null,
  spatialCoverage: null,
  transformations: [],
};
const presentation = {
  opacity: 1,
  color: "#cf3f02",
  strokeColor: "#443f3f",
  radius: 6,
  sourceLayer: null,
  rasterBand: 1,
  rescale: [0, 1023],
  colormap: "viridis",
  legendTitle: "",
  legendVisible: false,
  symbolProperty: null,
  categoryColors: {},
  filterProperty: null,
  filterValue: null,
};

async function preparePublication(directory: string, origin: string) {
  await cp("dist/viewer", directory, { recursive: true });
  await cp("fixtures/offline-runtime", join(directory, "assets"), {
    recursive: true,
  });
  await cp(
    "fixtures/field-notes/data/survey-sites.geojson",
    join(directory, "assets/survey-sites.geojson"),
  );
  await writeFile(
    join(directory, "style.json"),
    `${JSON.stringify({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#f6f1e8" } }] })}\n`,
  );
  await writeFile(
    join(directory, "publication.json"),
    `${JSON.stringify({
      schema: "earth-stories/publication/v1",
      build: {
        id: "offline-runtime-proof",
        projectId: "offline-runtime-proof",
        projectDigest: "0".repeat(64),
        runtimeVersion: "0.1.0",
      },
      metadata: {
        title: "Offline runtime acceptance",
        description: "Exact-origin runtime proof",
        author: null,
      },
      publication: { profile: "portable", theme: "cng" },
      basemap: {
        id: "local-neutral",
        label: "Local neutral",
        styleUrl: `${origin}/style.json`,
        attribution: null,
      },
      assets: [
        {
          id: "survey-sites",
          label: "River survey sites",
          kind: "geojson",
          delivery: "included",
          href: "assets/survey-sites.geojson",
          attribution: "Development Seed demonstration data",
          provenance,
          sizeBytes: 611,
          tileType: null,
          presentation: {
            ...presentation,
            opacity: 0.9,
            legendTitle: "River survey sites",
            legendVisible: true,
          },
          zarr: null,
          cog: null,
          trajectory: null,
          copc: null,
        },
        {
          id: "projected-dem",
          label: "Projected DEM",
          kind: "cog",
          delivery: "included",
          href: "assets/projected-dem.cog.tif",
          attribution: null,
          provenance,
          sizeBytes: 2209,
          tileType: null,
          presentation,
          zarr: null,
          cog: {
            epsg: 32618,
            definition:
              "+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs +type=crs",
          },
          trajectory: null,
          copc: null,
        },
        {
          id: "points",
          label: "GeoParquet points",
          kind: "geoparquet",
          delivery: "included",
          href: "assets/points.parquet",
          attribution: null,
          provenance,
          sizeBytes: 602,
          tileType: null,
          presentation,
          zarr: null,
          cog: null,
          trajectory: null,
          copc: null,
        },
      ],
      chapters: [
        {
          id: "arrival",
          type: "prose",
          title: "Where the river meets the city",
          narrative:
            "A field team followed the river corridor and recorded places where public space, habitat, and infrastructure overlap.",
        },
        {
          id: "sites",
          type: "map",
          title: "Three places to begin",
          narrative: "The field-notes fixture remains fully local.",
          camera: {
            center: [-77.026, 38.89],
            zoom: 11.2,
            bearing: 0,
            pitch: 28,
          },
          assetId: "survey-sites",
          overlayAssetIds: [],
          transition: "instant",
        },
        {
          id: "runtime-map",
          type: "map",
          title: "Local geospatial runtime",
          narrative: "",
          camera: {
            center: [-77.07, 38.9],
            zoom: 8,
            bearing: 0,
            pitch: 0,
          },
          assetId: "projected-dem",
          overlayAssetIds: ["points"],
          transition: "instant",
        },
      ],
      externalDependencies: [],
      hostingRequirements: ["static-http", "byte-ranges"],
    })}\n`,
  );
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
        return;
      }
      for (const listener of this.events) listener(message);
    });
  }

  send(method: string, params: Record<string, unknown> = {}) {
    const id = ++this.#nextId;
    return new Promise<any>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function openCdp(url: string) {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("CDP socket failed")),
      {
        once: true,
      },
    );
  });
  return new CdpClient(socket);
}

async function waitForDebugger(
  chrome: ReturnType<typeof spawn>,
  profileDirectory: string,
) {
  return new Promise<string>((resolve, reject) => {
    let stderr = "";
    let settled = false;
    const complete = (url: string) => {
      if (settled) return;
      settled = true;
      clearInterval(profileProbe);
      clearTimeout(timeout);
      resolve(url);
    };
    const fail = (cause: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(profileProbe);
      clearTimeout(timeout);
      reject(cause);
    };
    const profileProbe = setInterval(() => {
      void readFile(join(profileDirectory, "DevToolsActivePort"), "utf8")
        .then((contents) => {
          const [port, path] = contents.trim().split(/\r?\n/);
          if (port && path) complete(`ws://127.0.0.1:${port}${path}`);
        })
        .catch(() => undefined);
    }, 50);
    const timeout = setTimeout(
      () => fail(new Error(`Chrome debugging endpoint timed out: ${stderr}`)),
      20_000,
    );
    chrome.stderr?.setEncoding("utf8");
    chrome.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      complete(match[1]!);
    });
    chrome.once("exit", (code) => {
      fail(new Error(`Chrome exited before startup (${code}): ${stderr}`));
    });
  });
}

async function verifyInBrowser(origin: string, profileDirectory: string) {
  const useXvfb =
    process.platform === "linux" &&
    (await access(xvfbExecutable).then(
      () => true,
      () => false,
    ));
  const chromeArguments = [
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
    useXvfb ? xvfbExecutable : chromeExecutable,
    useXvfb
      ? ["-a", chromeExecutable, ...chromeArguments]
      : ["--headless=new", ...chromeArguments],
    { detached: process.platform !== "win32" },
  );
  try {
    const browserSocket = await waitForDebugger(chrome, profileDirectory);
    const browser = await openCdp(browserSocket);
    const version = await fetch(
      `http://${new URL(browserSocket).host}/json/version`,
    ).then(
      (response) =>
        response.json() as Promise<{ webSocketDebuggerUrl: string }>,
    );
    browser.socket.close();
    const page = await fetch(
      `http://${new URL(version.webSocketDebuggerUrl).host}/json/new?about:blank`,
      { method: "PUT" },
    ).then(
      (response) =>
        response.json() as Promise<{ webSocketDebuggerUrl: string }>,
    );
    const cdp = await openCdp(page.webSocketDebuggerUrl);
    const attemptedOutsideOrigin: string[] = [];
    const requestedPaths = new Set<string>();
    const runtimeErrors: string[] = [];
    cdp.events.push((message) => {
      if (message.method === "Fetch.requestPaused") {
        const requestUrl = message.params.request.url as string;
        const parsed = new URL(requestUrl);
        if (
          (parsed.protocol === "http:" || parsed.protocol === "https:") &&
          parsed.origin !== origin
        ) {
          attemptedOutsideOrigin.push(requestUrl);
          void cdp.send("Fetch.failRequest", {
            requestId: message.params.requestId,
            errorReason: "BlockedByClient",
          });
        } else {
          if (parsed.origin === origin) requestedPaths.add(parsed.pathname);
          void cdp.send("Fetch.continueRequest", {
            requestId: message.params.requestId,
          });
        }
      }
      if (message.method === "Runtime.exceptionThrown")
        runtimeErrors.push(
          message.params.exceptionDetails.exception?.description ??
            message.params.exceptionDetails.text,
        );
      if (
        message.method === "Log.entryAdded" &&
        message.params.entry.level === "error"
      )
        runtimeErrors.push(message.params.entry.text);
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
    await cdp.send("Page.navigate", { url: `${origin}/index.html` });
    const deadline = Date.now() + TIMEOUT_MS;
    const browserStateExpression = `(() => ({
      chapterCount: document.querySelectorAll('[data-chapter-id]').length,
      ready: [...document.querySelectorAll('[data-map-ready]')].map((node) => node.getAttribute('data-map-ready')),
      errors: [...document.querySelectorAll('[role="alert"]')].map((node) => ({ text: node.textContent, detail: node.getAttribute('data-error-detail') })),
      webgl: Boolean(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')),
      body: document.body.innerText.slice(0, 500)
    }))()`;
    let state: any = null;
    let chapterIndex = 0;
    while (Date.now() < deadline) {
      state = await cdp.send("Runtime.evaluate", {
        expression: browserStateExpression,
        returnByValue: true,
      });
      const readiness = state.result.value?.ready ?? [];
      if (
        readiness.length === 2 &&
        readiness.every((value: string) => value === "true")
      )
        break;
      await cdp.send("Runtime.evaluate", {
        expression: `document.querySelectorAll('[data-chapter-id]')[${chapterIndex}]?.scrollIntoView({ block: 'center' })`,
      });
      chapterIndex = (chapterIndex + 1) % 3;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await cdp.send("Runtime.evaluate", {
      expression:
        "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      awaitPromise: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    state = await cdp.send("Runtime.evaluate", {
      expression: browserStateExpression,
      returnByValue: true,
    });
    cdp.socket.close();
    if (
      state?.result.value?.ready?.length !== 2 ||
      !state.result.value.ready.every((value: string) => value === "true")
    )
      throw new Error(
        `Map readiness timed out: ${JSON.stringify({
          state: state?.result.value,
          attemptedOutsideOrigin,
          requestedPaths: [...requestedPaths].sort(),
          runtimeErrors,
        })}`,
      );
    if (state.result.value.webgl !== true)
      throw new Error("The browser proof did not obtain a WebGL context.");
    if (state.result.value.errors.length)
      throw new Error(
        `Viewer reported errors: ${JSON.stringify(state.result.value.errors)}`,
      );
    if (runtimeErrors.length)
      throw new Error(`Browser runtime errors: ${runtimeErrors.join(" | ")}`);
    if (attemptedOutsideOrigin.length)
      throw new Error(
        `Outside-origin requests were denied: ${attemptedOutsideOrigin.join(", ")}`,
      );
    const required = [
      "/assets/points.parquet",
      "/assets/projected-dem.cog.tif",
      "/assets/survey-sites.geojson",
      "/runtime/duckdb/duckdb-eh.wasm",
      "/runtime/duckdb/extensions/v1.4.3/wasm_eh/parquet.duckdb_extension.wasm",
      "/runtime/duckdb/extensions/v1.4.3/wasm_eh/spatial.duckdb_extension.wasm",
    ];
    const missing = required.filter(
      (path) => ![...requestedPaths].some((requested) => requested === path),
    );
    if (missing.length)
      throw new Error(
        `Expected production requests were not observed: ${missing.join(", ")}`,
      );
    process.stdout.write(
      `Offline runtime browser proof passed at ${origin}; ${requestedPaths.size} same-origin paths observed.\n`,
    );
  } finally {
    if (chrome.exitCode === null) {
      const exited = new Promise<void>((resolve) =>
        chrome.once("exit", () => resolve()),
      );
      try {
        if (process.platform !== "win32" && chrome.pid)
          process.kill(-chrome.pid, "SIGTERM");
        else chrome.kill("SIGTERM");
      } catch {
        // The browser process group already exited.
      }
      const stopped = await Promise.race([
        exited.then(() => true),
        new Promise<false>((resolve) =>
          setTimeout(() => resolve(false), 5_000),
        ),
      ]);
      if (!stopped) {
        try {
          if (process.platform !== "win32" && chrome.pid)
            process.kill(-chrome.pid, "SIGKILL");
          else chrome.kill("SIGKILL");
        } catch {
          // The process group exited between the timeout and signal.
        }
        await exited;
      }
    }
  }
}

const temporaryRoot = await mkdtemp(
  join(tmpdir(), "earth-stories-offline-runtime-"),
);
const publicationDirectory = join(temporaryRoot, "publication");
const profileDirectory = join(temporaryRoot, "chrome-profile");
try {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    if (pathname === "/favicon.ico") {
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return;
    }
    const result = await serveEditorFile(
      request,
      response,
      publicationDirectory,
      pathname,
    );
    if (result !== "served") staticNotFound(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Acceptance server did not bind a TCP port");
    const origin = `http://127.0.0.1:${address.port}`;
    await preparePublication(publicationDirectory, origin);
    await verifyInBrowser(origin, profileDirectory);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
} finally {
  await rm(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
