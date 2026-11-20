import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { startLocalService } from "../runtime.js";
import { ChatGPTProvider } from "../generation/chatgpt-provider.js";
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "chatgpt-routes-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "viewer"));
  const credentials = {
    read: async () => null,
    write: async () => {},
    clear: async () => {},
  };
  const service = await startLocalService({
    host: "127.0.0.1",
    port: 0,
    projectsDirectory: join(root, "projects"),
    viewerDirectory: join(root, "viewer"),
    editorDirectory: null,
    credentials,
    chatgptCredentials: credentials,
    githubApp: null,
    capabilityToken: "test-local-capability-not-a-real-credential",
    conversion: {
      pixiExecutable: join(root, "pixi"),
      manifestDirectory: root,
      workerDirectory: root,
      pixiHome: null,
    },
  });
  cleanups.push(() => service.close());
  const call = (
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(service.origin + "/api/generation/" + path, {
      method,
      headers: {
        authorization: "Bearer test-local-capability-not-a-real-credential",
        origin: service.origin,
        "content-type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { call };
}
it("routes sign-in, pending status, cancellation, sign-out, and model discovery", async () => {
  const { call } = await setup();
  expect(await (await call("connection")).json()).toMatchObject({
    configured: false,
    pending: false,
  });
  const started = await call("connection", "POST", {});
  expect(started.status).toBe(200);
  expect((await started.json()).url).toMatch(
    /^http:\/\/127\.0\.0\.1:\d+\/launch\?ticket=/,
  );
  expect(await (await call("connection")).json()).toMatchObject({
    pending: true,
  });
  expect(await (await call("connection/cancel", "POST")).json()).toMatchObject({
    pending: false,
  });
  expect(await (await call("connection", "DELETE")).json()).toMatchObject({
    configured: false,
    activeAccount: null,
  });
  const models = vi
    .spyOn(ChatGPTProvider.prototype, "models")
    .mockResolvedValue([{ id: "model", label: "Story model" }]);
  expect(await (await call("models")).json()).toEqual([
    { id: "model", label: "Story model" },
  ]);
  expect(models).toHaveBeenCalledOnce();
});
it("requires capability on every endpoint and trusted origins for connection mutations", async () => {
  const { call } = await setup();
  for (const [path, method] of [
    ["connection", "GET"],
    ["connection", "POST"],
    ["connection/cancel", "POST"],
    ["connection", "DELETE"],
    ["models", "GET"],
  ]) {
    expect(
      (
        await call(path!, method, method === "POST" ? {} : undefined, {
          authorization: "",
        })
      ).status,
    ).toBe(401);
    if (method !== "GET")
      expect(
        (
          await call(path!, method, method === "POST" ? {} : undefined, {
            origin: "https://untrusted.example",
          })
        ).status,
      ).toBe(403);
  }
});
it("rejects invalid account selections, oversized bodies, and unsupported methods", async () => {
  const { call } = await setup();
  expect((await call("connection", "POST", { accountId: 42 })).status).toBe(
    400,
  );
  expect(
    (await call("connection", "POST", { padding: "x".repeat(5000) })).status,
  ).toBe(400);
  expect((await call("connection", "PATCH", {})).status).toBe(405);
  expect(await (await call("connection")).json()).toMatchObject({
    pending: false,
  });
});
