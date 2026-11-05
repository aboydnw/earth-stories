import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectStore } from "@earth-stories/project-store";
import { resolveLocalServiceConfig } from "./config.js";
import { ConversionJobs } from "./conversion-jobs.js";
import type { ConversionRuntime } from "./conversion-runtime.js";
import { PagesJobs } from "./pages-jobs.js";
import {
  GitHubAppConnection,
  type GitHubConnectionSnapshot,
} from "./github-app.js";
import { createLocalServer } from "./server.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const capability = "test-local-capability-not-a-real-credential";
const snapshot: GitHubConnectionSnapshot = {
  configured: true,
  status: "connected",
  login: "mapper",
  authorizationUrl: null,
  installationUrl: "https://github.com/apps/earth-stories/installations/new",
  error: null,
};
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-github-routes-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const viewerDirectory = join(root, "viewer");
  await mkdir(viewerDirectory);
  const credentials = {
    read: async () => null,
    write: async () => undefined,
    clear: async () => undefined,
  };
  const config = await resolveLocalServiceConfig({
    host: "127.0.0.1",
    port: 0,
    projectsDirectory: join(root, "projects"),
    viewerDirectory,
    editorDirectory: null,
    credentials,
    capabilityToken: capability,
    githubApp: null,
    conversion: {
      pixiExecutable: join(root, "pixi"),
      manifestDirectory: join(root, "manifest"),
      workerDirectory: join(root, "worker"),
      pixiHome: null,
    },
  });
  const store = new ProjectStore(config.projectsDirectory);
  await store.initialize();
  const github = new GitHubAppConnection(credentials, null);
  const pages = new PagesJobs(store, { viewerDirectory });
  const server: Server = createLocalServer(store, config, {
    conversion: new ConversionJobs(store, {
      execute: async () => undefined,
    } as unknown as ConversionRuntime),
    pages,
    github,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("not listening");
  const url = `http://127.0.0.1:${address.port}`;
  const call = (path: string, method = "GET", origin = url) =>
    fetch(`${url}${path}`, {
      method,
      headers: { authorization: `Bearer ${capability}`, origin },
    });
  return { github, pages, call, url };
}

describe("GitHub connection routes", () => {
  it("returns an explicit unconfigured state without starting authentication", async () => {
    const { call } = await setup();
    const response = await call("/api/github/connection");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      configured: false,
      status: "disconnected",
      login: null,
      authorizationUrl: null,
      installationUrl: null,
      error: null,
    });
  });

  it("routes explicit connect, cancel, disconnect, and repository refresh", async () => {
    const { github, call } = await setup();
    const connect = vi.spyOn(github, "connect").mockResolvedValue({
      ...snapshot,
      status: "connecting",
      authorizationUrl:
        "https://github.com/login/oauth/authorize?state=example",
    });
    const cancel = vi
      .spyOn(github, "cancel")
      .mockResolvedValue({ ...snapshot, status: "disconnected" });
    const disconnect = vi
      .spyOn(github, "disconnect")
      .mockResolvedValue({ ...snapshot, status: "disconnected" });
    const repositories = [
      {
        id: 42,
        installationId: 7,
        owner: "mapper",
        name: "story",
        fullName: "mapper/story",
      },
    ];
    vi.spyOn(github, "repositories").mockResolvedValue(repositories);
    const started = await call("/api/github/connection", "POST");
    expect(await started.json()).toMatchObject({
      status: "connecting",
      authorizationUrl: expect.stringContaining("https://github.com/"),
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(await (await call("/api/github/repositories")).json()).toEqual({
      repositories,
    });
    expect((await call("/api/github/connection/cancel", "POST")).status).toBe(
      200,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect((await call("/api/github/connection", "DELETE")).status).toBe(200);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("requires the local capability and blocks foreign mutation origins", async () => {
    const { github, call, url } = await setup();
    const connect = vi.spyOn(github, "connect");
    expect((await fetch(`${url}/api/github/connection`)).status).toBe(401);
    expect(
      (
        await call(
          "/api/github/connection",
          "POST",
          "https://untrusted.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/api/github/connection/cancel",
          "POST",
          "https://untrusted.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/api/github/connection",
          "DELETE",
          "https://untrusted.example",
        )
      ).status,
    ).toBe(403);
    expect(connect).not.toHaveBeenCalled();
  });

  it("refuses disconnect while a publication is active", async () => {
    const { github, pages, call } = await setup();
    vi.spyOn(pages, "activity").mockReturnValue(1);
    const disconnect = vi.spyOn(github, "disconnect");
    const response = await call("/api/github/connection", "DELETE");
    expect(response.ok).toBe(false);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("Wait for publishing"),
    });
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("returns method errors without changing connection state", async () => {
    const { github, call } = await setup();
    const connect = vi.spyOn(github, "connect");
    expect((await call("/api/github/connection", "PUT")).status).toBe(405);
    expect((await call("/api/github/repositories", "POST")).status).toBe(404);
    expect(connect).not.toHaveBeenCalled();
  });
});
