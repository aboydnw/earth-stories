import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const packageDirectory = resolve("apps/local-service");
const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("production service bundle", () => {
  it("runs from a sanitized plain Node child with only the relocated bundle", async () => {
    await exec("yarn", ["workspace", "@earth-stories/local-service", "build"], {
      cwd: resolve("."),
    });
    const root = await mkdtemp(join(tmpdir(), "earth-stories-bundle-"));
    temporaryDirectories.push(root);
    const relocated = join(root, "service.js");
    await cp(join(packageDirectory, "dist/service.js"), relocated);
    await cp(join(packageDirectory, "dist/service.js.map"), `${relocated}.map`);
    const harness = join(root, "harness.mjs");
    await writeFile(
      harness,
      `
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const listeningServers = () => process._getActiveHandles().filter((handle) => handle?.constructor?.name === "Server" && handle.listening).length;
const post = (origin, path, body, headers = {}) => fetch(origin + path, { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const waitForJob = async (origin, id) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = await (await fetch(origin + "/api/conversion-jobs/" + id)).json();
    if (job.status === "succeeded" || job.status === "failed") return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("conversion job did not finish");
};
const createConversion = async (service, title) => {
  const created = await (await post(service.origin, "/api/projects", { title })).json();
  const uploaded = await fetch(service.origin + "/api/projects/" + created.id + "/assets?filename=places.geojson", { method: "POST", headers: { origin: service.origin, "content-type": "application/geo+json" }, body: "{}" });
  if (!uploaded.ok) throw new Error("asset upload failed");
  const queued = await (await post(service.origin, "/api/projects/" + created.id + "/conversions", { operation: "inspect", capability: "vector", assetPath: "assets/places.geojson" })).json();
  return waitForJob(service.origin, queued.id);
};
const before = listeningServers();
const bundled = await import("./service.js");
const after = listeningServers();
const projectsDirectory = join(process.cwd(), "projects");
let workspaceCreatedOnImport = true;
try { await access(projectsDirectory); } catch { workspaceCreatedOnImport = false; }
const viewerDirectory = join(process.cwd(), "viewer");
await mkdir(viewerDirectory);
const pixiExecutable = join(process.cwd(), "pixi");
let bootstrapCalls = 0;
const service = await bundled.startLocalService({
  host: "127.0.0.1", port: 0, projectsDirectory, viewerDirectory,
  editorDirectory: null,
  conversion: { pixiExecutable, manifestDirectory: process.cwd(), workerDirectory: process.cwd(), pixiHome: null },
  credentials: { read: async () => null, write: async () => undefined, clear: async () => undefined },
  capabilityToken: null,
}, {
  bootstrapPixi: async (requestedExecutable) => {
    if (requestedExecutable !== pixiExecutable) throw new Error("wrong Pixi path");
    bootstrapCalls += 1;
    await writeFile(requestedExecutable, ${JSON.stringify(`#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  if (process.argv[2] !== "run") return;
  const request = JSON.parse(input);
  process.stdout.write(JSON.stringify({ protocol: request.protocol, requestId: request.requestId, type: "result", status: "succeeded", output: { format: "vector" }, tools: [], warnings: [] }) + "\\n");
});
`)}, "utf8");
    await chmod(requestedExecutable, 0o700);
  },
});
let result;
try {
  const health = await (await fetch(service.origin + "/health")).json();
  const createdResponse = await fetch(service.origin + "/api/projects", { method: "POST", headers: { origin: service.origin, "content-type": "application/json" }, body: JSON.stringify({ title: "Relocated child" }) });
  const created = await createdResponse.json();
  const read = await (await fetch(service.origin + "/api/projects/" + created.id)).json();
  const injectedJob = await createConversion(service, "Injected bootstrap");
  result = { before, after, workspaceCreatedOnImport, exported: typeof bundled.FileCredentialStore === "function", health, createStatus: createdResponse.status, title: read.metadata.title, bootstrapCalls, injectedStatus: injectedJob.status };
} finally { await service.close(); }
const noBootstrap = await bundled.startLocalService({
  host: "127.0.0.1", port: 0, projectsDirectory: join(process.cwd(), "projects-no-bootstrap"), viewerDirectory,
  editorDirectory: null,
  conversion: { pixiExecutable: join(process.cwd(), "missing-pixi"), manifestDirectory: process.cwd(), workerDirectory: process.cwd(), pixiHome: null },
  credentials: { read: async () => null, write: async () => undefined, clear: async () => undefined },
  capabilityToken: null,
});
try {
  const failedJob = await createConversion(noBootstrap, "No bootstrap");
  result.noBootstrapStatus = failedJob.status;
  result.noBootstrapMessage = failedJob.events.at(-1)?.message;
} finally { await noBootstrap.close(); }
try { await access(join(process.cwd(), "scripts")); result.repositoryScriptsPresent = true; } catch { result.repositoryScriptsPresent = false; }
process.stdout.write(JSON.stringify(result) + "\\n");
`,
      "utf8",
    );
    expect((await readdir(root)).sort()).toEqual([
      "harness.mjs",
      "service.js",
      "service.js.map",
    ]);
    const environment = { ...process.env };
    delete environment.NODE_OPTIONS;
    delete environment.NODE_PATH;
    const { stdout, stderr } = await exec(process.execPath, ["harness.mjs"], {
      cwd: root,
      env: environment,
      timeout: 10_000,
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      before: expect.any(Number),
      after: expect.any(Number),
      workspaceCreatedOnImport: false,
      exported: true,
      health: { status: "ready", projectsDirectory: join(root, "projects") },
      createStatus: 201,
      title: "Relocated child",
      bootstrapCalls: 1,
      injectedStatus: "succeeded",
      noBootstrapStatus: "failed",
      noBootstrapMessage:
        "Pixi is missing and this service host did not provide a bootstrap.",
      repositoryScriptsPresent: false,
    });
    const parsed = JSON.parse(stdout) as { before: number; after: number };
    expect(parsed.after).toBe(parsed.before);
  });
});
