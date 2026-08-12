import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectStore } from "@earth-stories/project-store";
import { resolveLocalServiceConfig, type CredentialStore } from "./config.js";
import { ConversionJobs } from "./conversion-jobs.js";
import type { ConversionRuntime } from "./conversion-runtime.js";
import { PagesJobs } from "./pages-jobs.js";

const temporaryDirectories: string[] = [];
const credentials: CredentialStore = {
  read: async () => null,
  write: async () => undefined,
  clear: async () => undefined,
};

async function setup(
  options: {
    limits?: { maxBodyBytes?: number };
    capabilityToken?: string | null;
    editorFiles?: Record<string, string>;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-server-"));
  temporaryDirectories.push(root);
  const viewerDirectory = join(root, "viewer");
  const projectsDirectory = join(root, "projects");
  await mkdir(viewerDirectory);
  const editorDirectory = options.editorFiles
    ? join(root, "release.01234567-editor", "editor")
    : null;
  if (editorDirectory) {
    await mkdir(editorDirectory, { recursive: true });
    for (const [path, contents] of Object.entries(options.editorFiles ?? {})) {
      const target = join(editorDirectory, path);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, contents);
    }
  }
  const config = await resolveLocalServiceConfig({
    host: "127.0.0.1",
    port: 0,
    projectsDirectory,
    viewerDirectory,
    editorDirectory,
    conversion: {
      pixiExecutable: join(root, "pixi"),
      manifestDirectory: join(root, "manifest"),
      workerDirectory: join(root, "worker"),
      pixiHome: null,
    },
    credentials,
    capabilityToken: options.capabilityToken ?? null,
    limits: options.limits,
  });
  const store = new ProjectStore(projectsDirectory);
  await store.initialize();
  const jobs = {
    conversion: new ConversionJobs(store, {
      execute: async () => undefined,
    } as unknown as ConversionRuntime),
    pages: new PagesJobs(store, { viewerDirectory }),
  };
  return { config, store, jobs, root, editorDirectory };
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("not bound");
  return address.port;
}

async function descriptorFor(path: string): Promise<string | null> {
  const expected = await realpath(path);
  for (const descriptor of await readdir("/proc/self/fd")) {
    const link = `/proc/self/fd/${descriptor}`;
    const target = await readlink(link).catch(() => null);
    if (target === expected) return link;
  }
  return null;
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("condition not reached");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("createLocalServer", () => {
  it("imports without opening a port or creating a directory", async () => {
    const projectsDirectory = join(
      tmpdir(),
      `earth-stories-import-${crypto.randomUUID()}`,
    );
    const previous = process.env.EARTH_STORIES_PROJECTS_DIR;
    process.env.EARTH_STORIES_PROJECTS_DIR = projectsDirectory;
    const before = (process as unknown as { _getActiveHandles(): unknown[] })
      ._getActiveHandles()
      .filter((handle) => handle instanceof Object && "address" in handle);
    try {
      await import(
        /* @vite-ignore */ new URL("./server.js?import-safe", import.meta.url)
          .href
      );
      await import(
        /* @vite-ignore */ new URL("./config.js?import-safe", import.meta.url)
          .href
      );
      await import(
        /* @vite-ignore */ new URL(
          "./conversion-runtime.js?import-safe",
          import.meta.url,
        ).href
      );
    } finally {
      if (previous === undefined) delete process.env.EARTH_STORIES_PROJECTS_DIR;
      else process.env.EARTH_STORIES_PROJECTS_DIR = previous;
    }
    const after = (process as unknown as { _getActiveHandles(): unknown[] })
      ._getActiveHandles()
      .filter((handle) => handle instanceof Object && "address" in handle);
    expect(after).toHaveLength(before.length);
    await expect(access(projectsDirectory)).rejects.toThrow();
  });

  it("uses the actual bound port when parsing request URLs", async () => {
    const { config, store, jobs } = await setup();
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config, jobs);
    const port = await listen(server);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "ready",
        projectsDirectory: store.root,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("preserves the body-limit boundary with injected limits", async () => {
    const { config, store, jobs } = await setup({
      limits: { maxBodyBytes: 12 },
    });
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config, jobs);
    const port = await listen(server);
    try {
      const accepted = await fetch(`http://127.0.0.1:${port}/api/discover`, {
        method: "POST",
        headers: { origin: `http://127.0.0.1:${port}` },
        body: "123456789012",
      });
      expect(await accepted.json()).toEqual({
        error: expect.not.stringContaining("too large"),
      });
      const rejected = await fetch(`http://127.0.0.1:${port}/api/discover`, {
        method: "POST",
        headers: { origin: `http://127.0.0.1:${port}` },
        body: "1234567890123",
      });
      expect(await rejected.json()).toEqual({
        error: "Request body is too large",
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("preserves the JSON 404 boundary when editor serving is disabled", async () => {
    const { config, store, jobs } = await setup();
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config, jobs);
    const port = await listen(server);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(await response.text()).toBe('{"error":"Not found"}\n');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("serves editor MIME types and falls back only for extensionless SPA routes", async () => {
    const { config, store, jobs } = await setup({
      editorFiles: {
        "index.html": "<main>editor shell</main>",
        "assets/app.01234567.js": "export const answer = 42;",
        "assets/theme.css": "body { color: green; }",
        "assets/brand.woff2": "font",
      },
    });
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config, jobs);
    const port = await listen(server);
    try {
      const script = await fetch(
        `http://127.0.0.1:${port}/assets/app.01234567.js`,
      );
      expect(script.status).toBe(200);
      expect(script.headers.get("content-type")).toBe(
        "text/javascript; charset=utf-8",
      );
      expect(await script.text()).toBe("export const answer = 42;");

      const font = await fetch(`http://127.0.0.1:${port}/assets/brand.woff2`);
      expect(font.headers.get("content-type")).toBe("font/woff2");

      const spa = await fetch(`http://127.0.0.1:${port}/stories/new`);
      expect(spa.status).toBe(200);
      expect(spa.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(await spa.text()).toBe("<main>editor shell</main>");

      const extensionMiss = await fetch(
        `http://127.0.0.1:${port}/assets/missing.js`,
      );
      expect(extensionMiss.status).toBe(404);
      expect(extensionMiss.headers.get("content-type")).toBe(
        "text/plain; charset=utf-8",
      );
      expect(await extensionMiss.text()).toBe("Not found\n");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("keeps unmatched API routes JSON even when an editor is configured", async () => {
    const { config, store, jobs } = await setup({
      editorFiles: { "index.html": "not an API response" },
    });
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config, jobs);
    const port = await listen(server);
    try {
      for (const path of [
        "/api",
        "/api/not-a-route",
        "/api%2fprojects",
        "/api%2Fnot-a-route",
        "/%61pi%2fnot-a-route",
      ]) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
        expect(response.status).toBe(404);
        expect(response.headers.get("content-type")).toBe(
          "application/json; charset=utf-8",
        );
        expect(await response.text()).toBe('{"error":"Not found"}\n');
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("treats only the API path segment as API and gives real API routes precedence", async () => {
    const { config, store, jobs } = await setup({
      editorFiles: {
        "index.html": "editor shell",
        "api/projects": "must not shadow the API",
      },
    });
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config, jobs);
    const port = await listen(server);
    try {
      const api = await fetch(`http://127.0.0.1:${port}/api/projects`);
      expect(api.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(await api.json()).toEqual([]);

      const nonApi = await fetch(`http://127.0.0.1:${port}/apiary`);
      expect(nonApi.status).toBe(200);
      expect(await nonApi.text()).toBe("editor shell");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects encoded traversal and symlinks escaping the editor root without leaking paths", async () => {
    const { config, store, jobs, root, editorDirectory } = await setup({
      editorFiles: { "index.html": "editor" },
    });
    const secret = join(root, "secret.txt");
    await writeFile(secret, "outside secret");
    await symlink(secret, join(editorDirectory!, "leak.txt"));
    await symlink(secret, join(editorDirectory!, "leak"));
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config, jobs);
    const port = await listen(server);
    try {
      for (const path of [
        "/leak.txt",
        "/leak",
        "/..%2fsecret.txt",
        "/%2e%2e%2fsecret.txt",
        "/%2e%2e%2fsecret",
        "/%252e%252e%252fsecret",
        "/%25252e%25252e%25252fsecret",
      ]) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
        expect(response.status).toBe(404);
        const body = await response.text();
        expect(body).toBe("Not found\n");
        expect(body).not.toContain(root);
        expect(body).not.toContain("outside secret");
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("supports ranges, validators, HEAD, and editor cache policy", async () => {
    const { config, store, jobs } = await setup({
      editorFiles: {
        "index.html": "editor shell",
        "assets/app.01234567.js": "0123456789",
        "assets/index-cNtA-444.js": "vite hash with hyphen",
        "assets/GeoParquetOverlay-HsoHMYXt.js": "vite mixed-case hash",
        "assets/editor-style.css": "declared css",
        "assets/editor-logo.svg": "declared asset",
        "assets/editor-settings.js": "ordinary hyphenated name",
        "assets/index-ZZZZ9999.js": "undeclared vite-looking name",
        "assets/readme.txt": "ordinary",
        ".vite/manifest.json": JSON.stringify({
          "index.html": {
            file: "assets/index-cNtA-444.js",
            css: ["assets/editor-style.css"],
            assets: ["assets/editor-logo.svg"],
            imports: ["_GeoParquetOverlay.ts"],
          },
          "_GeoParquetOverlay.ts": {
            file: "assets/GeoParquetOverlay-HsoHMYXt.js",
          },
          "legacy.ts": { file: "assets/app.01234567.js" },
        }),
      },
    });
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config, jobs);
    const port = await listen(server);
    try {
      const base = `http://127.0.0.1:${port}`;
      const ranged = await fetch(`${base}/assets/app.01234567.js`, {
        headers: { range: "bytes=2-5" },
      });
      expect(ranged.status).toBe(206);
      expect(ranged.headers.get("content-range")).toBe("bytes 2-5/10");
      expect(ranged.headers.get("accept-ranges")).toBe("bytes");
      expect(ranged.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );
      expect(await ranged.text()).toBe("2345");

      for (const path of [
        "/assets/index-cNtA-444.js",
        "/assets/GeoParquetOverlay-HsoHMYXt.js",
        "/assets/editor-style.css",
        "/assets/editor-logo.svg",
      ]) {
        const viteAsset = await fetch(`${base}${path}`);
        expect(viteAsset.headers.get("cache-control")).toBe(
          "public, max-age=31536000, immutable",
        );
      }
      const ordinaryHyphenated = await fetch(
        `${base}/assets/editor-settings.js`,
      );
      expect(ordinaryHyphenated.headers.get("cache-control")).toBe("no-cache");
      const undeclaredViteName = await fetch(
        `${base}/assets/index-ZZZZ9999.js`,
      );
      expect(undeclaredViteName.headers.get("cache-control")).toBe("no-cache");

      const full = await fetch(`${base}/assets/readme.txt`);
      const etag = full.headers.get("etag");
      expect(etag).toMatch(/^".+"$/);
      expect(full.headers.get("cache-control")).toBe("no-cache");
      const unchanged = await fetch(`${base}/assets/readme.txt`, {
        headers: { "if-none-match": etag! },
      });
      expect(unchanged.status).toBe(304);
      expect(await unchanged.text()).toBe("");

      const head = await fetch(`${base}/assets/readme.txt`, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(head.headers.get("content-length")).toBe("8");
      expect(await head.text()).toBe("");

      const index = await fetch(`${base}/`);
      expect(index.headers.get("cache-control")).toBe("no-store");

      const invalidRange = await fetch(`${base}/assets/readme.txt`, {
        headers: { range: "bytes=0-1,4-5" },
      });
      expect(invalidRange.status).toBe(416);
      expect(invalidRange.headers.get("content-range")).toBe("bytes */8");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("uses no-cache when the Vite manifest is absent or malformed", async () => {
    for (const manifest of [undefined, "not json"]) {
      const { config, store, jobs } = await setup({
        editorFiles: {
          "index.html": "editor shell",
          "assets/index-cNtA-444.js": "hash-looking asset",
          ...(manifest === undefined
            ? {}
            : { ".vite/manifest.json": manifest }),
        },
      });
      const { createLocalServer } = await import("./server.js");
      const server = createLocalServer(store, config, jobs);
      const port = await listen(server);
      try {
        const response = await fetch(
          `http://127.0.0.1:${port}/assets/index-cNtA-444.js`,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-cache");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  });

  it("streams the validated opened file when its pathname is swapped", async () => {
    const { config, store, jobs, root, editorDirectory } = await setup({
      editorFiles: { "race.txt": "inside bytes" },
    });
    const outside = join(root, "outside.txt");
    const target = join(editorDirectory!, "race.txt");
    await writeFile(outside, "outside bytes");
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config, jobs, {
      testOnlyAfterStaticOpen: async (openedPath) => {
        if (openedPath !== target) return;
        await rename(target, join(editorDirectory!, "opened.txt"));
        await symlink(outside, target);
      },
    });
    const port = await listen(server);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/race.txt`);
      expect(await readFile(target, "utf8")).toBe("outside bytes");
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("inside bytes");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects a pathname swapped before opened-file identity validation", async () => {
    const { config, store, jobs, root, editorDirectory } = await setup({
      editorFiles: { "race-before.txt": "inside bytes" },
    });
    const outside = join(root, "outside-before.txt");
    const target = join(editorDirectory!, "race-before.txt");
    await writeFile(outside, "outside bytes");
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config, jobs, {
      testOnlyBeforeStaticIdentityCheck: async (openedPath) => {
        if (openedPath !== target) return;
        await rename(target, join(editorDirectory!, "opened-before.txt"));
        await symlink(outside, target);
      },
    });
    const port = await listen(server);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/race-before.txt`);
      expect(await readFile(target, "utf8")).toBe("outside bytes");
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found\n");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.runIf(process.platform === "linux")(
    "closes the opened file when the client disconnects during identity validation",
    async () => {
      const { config, store, jobs, editorDirectory } = await setup({
        editorFiles: { "abort.txt": "inside bytes" },
      });
      const target = join(editorDirectory!, "abort.txt");
      let releaseIdentity!: () => void;
      const identityGate = new Promise<void>((resolve) => {
        releaseIdentity = resolve;
      });
      let opened!: () => void;
      const openedFile = new Promise<void>((resolve) => {
        opened = resolve;
      });
      const { createLocalServer } = await import("./server.js");
      const server = createLocalServer(store, config, jobs, {
        testOnlyBeforeStaticIdentityCheck: async (openedPath) => {
          if (openedPath !== target) return;
          opened();
          await identityGate;
        },
      });
      const port = await listen(server);
      const request = httpRequest({
        host: "127.0.0.1",
        port,
        path: "/abort.txt",
      });
      request.on("error", () => undefined);
      request.end();
      try {
        await openedFile;
        const descriptor = await descriptorFor(target);
        expect(descriptor).not.toBeNull();
        const expectedTarget = await realpath(target);
        request.destroy();
        await waitUntil(
          async () =>
            (await readlink(descriptor!).catch(() => null)) !== expectedTarget,
        );
        releaseIdentity();
      } finally {
        request.destroy();
        releaseIdentity();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );

  it("applies capability authorization before routing without disclosing the token", async () => {
    const token = "desktop-secret-that-must-not-leak";
    const { config, store, jobs } = await setup({
      capabilityToken: token,
      editorFiles: { "index.html": "protected editor" },
    });
    const { createLocalServer } = await import("./server.js");
    const server = createLocalServer(store, config, jobs);
    const port = await listen(server);
    try {
      for (const headers of [
        undefined,
        { authorization: "Bearer wrong" },
      ] satisfies Array<HeadersInit | undefined>) {
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
          headers,
        });
        expect(response.status).toBe(401);
        expect(response.headers.get("authorization")).toBeNull();
        expect(await response.text()).toBe('{"error":"Unauthorized"}\n');
      }
      const accepted = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(accepted.status).toBe(200);
      expect(await accepted.text()).toBe("protected editor");

      const untrustedMutation = await fetch(
        `http://127.0.0.1:${port}/api/projects`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            origin: "https://attacker.example",
          },
          body: "{}",
        },
      );
      expect(untrustedMutation.status).toBe(403);
      expect(await untrustedMutation.text()).toBe(
        '{"error":"Untrusted request origin"}\n',
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("refuses server construction if the test seam disables origin enforcement in capability mode", async () => {
    const { config, store, jobs } = await setup({
      capabilityToken: "desktop-secret",
    });
    const { createLocalServer } = await import("./server.js");
    expect(() =>
      (
        createLocalServer as unknown as (
          ...args: [typeof store, typeof config, typeof jobs, object]
        ) => Server
      )(store, config, jobs, { testOnlyDisableTrustedMutationOrigin: true }),
    ).toThrow(/trusted.*origin/i);
  });
});
