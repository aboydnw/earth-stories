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
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
const listeningServers = () => process._getActiveHandles().filter((handle) => handle?.constructor?.name === "Server" && handle.listening).length;
const before = listeningServers();
const bundled = await import("./service.js");
const after = listeningServers();
const projectsDirectory = join(process.cwd(), "projects");
let workspaceCreatedOnImport = true;
try { await access(projectsDirectory); } catch { workspaceCreatedOnImport = false; }
const viewerDirectory = join(process.cwd(), "viewer");
await mkdir(viewerDirectory);
const service = await bundled.startLocalService({
  host: "127.0.0.1", port: 0, projectsDirectory, viewerDirectory,
  editorDirectory: null,
  conversion: { pixiExecutable: join(process.cwd(), "pixi"), manifestDirectory: process.cwd(), workerDirectory: process.cwd(), pixiHome: null },
  credentials: { read: async () => null, write: async () => undefined, clear: async () => undefined },
  capabilityToken: null,
});
let result;
try {
  const health = await (await fetch(service.origin + "/health")).json();
  const createdResponse = await fetch(service.origin + "/api/projects", { method: "POST", headers: { origin: service.origin, "content-type": "application/json" }, body: JSON.stringify({ title: "Relocated child" }) });
  const created = await createdResponse.json();
  const read = await (await fetch(service.origin + "/api/projects/" + created.id)).json();
  result = { before, after, workspaceCreatedOnImport, exported: typeof bundled.FileCredentialStore === "function", health, createStatus: createdResponse.status, title: read.metadata.title };
} finally { await service.close(); }
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
    });
    const parsed = JSON.parse(stdout) as { before: number; after: number };
    expect(parsed.after).toBe(parsed.before);
  });
});
