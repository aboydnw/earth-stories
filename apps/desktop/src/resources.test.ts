import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageDirectory = resolve(import.meta.dirname, "..");
const stageScript = join(packageDirectory, "scripts/stage-resources.mjs");
const verifyScript = join(packageDirectory, "scripts/verify-resources.mjs");

const fixtureFiles: Record<string, string> = {
  "apps/local-service/dist/service.js": "export const service = true;\n",
  "apps/local-service/dist/service.js.LICENSE.txt":
    "Bundled service licenses\n",
  "dist/editor/index.html": "<main>editor</main>\n",
  "dist/viewer/index.html": "<main>viewer</main>\n",
  "pixi.toml": "[workspace]\nname = 'fixture'\n",
  "pixi.lock": "version: 6\n",
  "conversion/worker/models.py": "class Job: pass\n",
  "conversion/worker/worker.py": "print('worker')\n",
  "conversion/schema/conversion-v1.schema.json": "{}\n",
  "scripts/install-pixi.mjs": "export {};\n",
  LICENSE: "Fixture license\n",
  "apps/desktop/resources/credits/THIRD_PARTY_NOTICES.md":
    "# Third-party notices\n",
};

const expectedFiles = [
  "credits/EARTH_STORIES_LICENSE",
  "credits/THIRD_PARTY_NOTICES.md",
  "editor/index.html",
  "resource-manifest.json",
  "service/service.js",
  "service/service.js.LICENSE.txt",
  "viewer/index.html",
  "conversion/contract/conversion-v1.schema.json",
  "conversion/install-pixi.mjs",
  "conversion/pixi.lock",
  "conversion/pixi.toml",
  "conversion/worker/models.py",
  "conversion/worker/worker.py",
].sort();

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-resources-"));
  for (const [relativePath, contents] of Object.entries(fixtureFiles)) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }
  return root;
}

async function listFiles(root: string, directory = root): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, path)));
    else files.push(path.slice(root.length + 1).replaceAll("\\", "/"));
  }
  return files.sort();
}

describe("packaged desktop resources", () => {
  it("stages the read-only runtime contract and records every shipped file", async () => {
    const repository = await createFixture();
    const output = join(repository, "build", "resources");

    await execFileAsync(process.execPath, [
      stageScript,
      "--repository",
      repository,
      "--output",
      output,
    ]);

    expect(await listFiles(output)).toEqual(expectedFiles);
    const manifest = JSON.parse(
      await readFile(join(output, "resource-manifest.json"), "utf8"),
    ) as { files: Array<{ path: string; sha256: string }> };
    expect(manifest.files.map((entry) => entry.path).sort()).toEqual(
      expectedFiles.filter((path) => path !== "resource-manifest.json"),
    );
    expect(
      manifest.files.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)),
    ).toBe(true);
  });

  it("fails before replacing staged resources when a required input is absent", async () => {
    const repository = await createFixture();
    const output = join(repository, "build", "resources");
    await mkdir(output, { recursive: true });
    await writeFile(join(output, "keep.txt"), "previous staging output\n");
    const { rm } = await import("node:fs/promises");
    await rm(join(repository, "pixi.lock"));

    const error = await execFileAsync(process.execPath, [
      stageScript,
      "--repository",
      repository,
      "--output",
      output,
    ]).catch((cause: unknown) => cause as { message: string; stderr: string });

    expect(`${error.message}\n${error.stderr}`).toContain(
      "Missing required resource: pixi.lock",
    );
    expect(await readFile(join(output, "keep.txt"), "utf8")).toBe(
      "previous staging output\n",
    );
  });

  it("verifies the actual unpacked package and detects resource drift", async () => {
    const repository = await createFixture();
    const staged = join(repository, "build", "resources");
    const packaged = join(repository, "package", "resources");
    await execFileAsync(process.execPath, [
      stageScript,
      "--repository",
      repository,
      "--output",
      staged,
    ]);
    await cp(staged, packaged, { recursive: true });
    await writeFile(join(packaged, "app.asar"), "packaged application\n");

    await expect(
      execFileAsync(process.execPath, [
        verifyScript,
        "--resources",
        packaged,
        "--manifest",
        join(staged, "resource-manifest.json"),
      ]),
    ).resolves.toMatchObject({ stderr: "" });

    await writeFile(
      join(packaged, "conversion/worker/worker.py"),
      "tampered\n",
    );
    const error = await execFileAsync(process.execPath, [
      verifyScript,
      "--resources",
      packaged,
      "--manifest",
      join(staged, "resource-manifest.json"),
    ]).catch((cause: unknown) => cause as { message: string; stderr: string });
    expect(`${error.message}\n${error.stderr}`).toContain(
      "Resource digest mismatch: conversion/worker/worker.py",
    );

    await cp(staged, packaged, { recursive: true, force: true });
    await writeFile(
      join(packaged, "resource-manifest.json"),
      '{"formatVersion":1,"files":[]}\n',
    );
    const manifestError = await execFileAsync(process.execPath, [
      verifyScript,
      "--resources",
      packaged,
      "--manifest",
      join(staged, "resource-manifest.json"),
    ]).catch((cause: unknown) => cause as { message: string; stderr: string });
    expect(`${manifestError.message}\n${manifestError.stderr}`).toContain(
      "Packaged resource manifest does not match staged manifest",
    );

    await cp(staged, packaged, { recursive: true, force: true });
    await writeFile(join(packaged, "unexpected.txt"), "undeclared\n");
    const unexpectedError = await execFileAsync(process.execPath, [
      verifyScript,
      "--resources",
      packaged,
      "--manifest",
      join(staged, "resource-manifest.json"),
    ]).catch((cause: unknown) => cause as { message: string; stderr: string });
    expect(`${unexpectedError.message}\n${unexpectedError.stderr}`).toContain(
      "Packaged resource tree does not match manifest",
    );
  });
});
