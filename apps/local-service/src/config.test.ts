import { access, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SERVICE_LIMITS,
  resolveLocalServiceConfig,
  type CredentialStore,
  type LocalServiceConfig,
} from "./config.js";

const temporaryDirectories: string[] = [];

const credentials: CredentialStore = {
  read: async () => null,
  write: async () => undefined,
  clear: async () => undefined,
};

async function fixture(): Promise<LocalServiceConfig> {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-config-"));
  temporaryDirectories.push(root);
  const viewerDirectory = join(root, "viewer");
  await mkdir(viewerDirectory);
  return {
    host: "127.0.0.1",
    port: 0,
    projectsDirectory: join(root, "workspaces", "projects"),
    viewerDirectory,
    editorDirectory: null,
    conversion: {
      pixiExecutable: join(root, "tools", "pixi"),
      manifestDirectory: join(root, "manifest"),
      workerDirectory: join(root, "worker"),
      pixiHome: null,
    },
    credentials,
    capabilityToken: null,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("resolveLocalServiceConfig", () => {
  it("creates the projects directory and fills byte-identical default limits", async () => {
    const config = await fixture();

    const resolved = await resolveLocalServiceConfig(config);

    await expect(access(config.projectsDirectory)).resolves.toBeUndefined();
    expect(resolved.limits).toEqual({
      maxBodyBytes: 2_097_152,
      maxAssetBytes: 5_368_709_120,
      maxExportBodyBytes: 52_428_800,
      maxShareCardBodyBytes: 8_388_608,
    });
    expect(DEFAULT_SERVICE_LIMITS).toEqual(resolved.limits);
  });

  it.each(["0.0.0.0", "localhost", "::1"])(
    "rejects non-canonical host %s",
    async (host) => {
      const config = await fixture();
      await expect(
        resolveLocalServiceConfig({ ...config, host }),
      ).rejects.toThrow(/127\.0\.0\.1/);
    },
  );

  it.each([-1, 65_536, 3.5, Number.NaN])(
    "rejects invalid port %s",
    async (port) => {
      const config = await fixture();
      await expect(
        resolveLocalServiceConfig({ ...config, port }),
      ).rejects.toThrow(/port/i);
    },
  );

  it("accepts port zero and the highest TCP port", async () => {
    const zero = await fixture();
    const highest = await fixture();
    await expect(resolveLocalServiceConfig(zero)).resolves.toMatchObject({
      port: 0,
    });
    await expect(
      resolveLocalServiceConfig({ ...highest, port: 65_535 }),
    ).resolves.toMatchObject({ port: 65_535 });
  });

  it.each(["", " ", "\t\n"])(
    "rejects an empty or whitespace-only capability token %j",
    async (capabilityToken) => {
      const config = await fixture();
      await expect(
        resolveLocalServiceConfig({ ...config, capabilityToken }),
      ).rejects.toThrow(
        "capabilityToken must be null or contain a non-whitespace character.",
      );
    },
  );

  it("preserves every byte of a valid capability token", async () => {
    const config = await fixture();
    const capabilityToken = "  desktop secret\t";

    await expect(
      resolveLocalServiceConfig({ ...config, capabilityToken }),
    ).resolves.toMatchObject({ capabilityToken });
  });

  it.each([
    ["projectsDirectory", "projects"],
    ["viewerDirectory", "viewer"],
    ["editorDirectory", "editor"],
    ["conversion.pixiExecutable", "pixi"],
    ["conversion.manifestDirectory", "manifest"],
    ["conversion.workerDirectory", "worker"],
    ["conversion.pixiHome", "pixi-home"],
  ])("rejects relative %s", async (field, relativePath) => {
    const config = await fixture();
    const invalid: LocalServiceConfig = {
      ...config,
      ...(field === "projectsDirectory"
        ? { projectsDirectory: relativePath }
        : field === "viewerDirectory"
          ? { viewerDirectory: relativePath }
          : field === "editorDirectory"
            ? { editorDirectory: relativePath }
            : {
                conversion: {
                  ...config.conversion,
                  [field.split(".")[1]]: relativePath,
                },
              }),
    };
    await expect(resolveLocalServiceConfig(invalid)).rejects.toThrow(
      /absolute/i,
    );
  });

  it("rejects a missing viewer directory", async () => {
    const config = await fixture();
    await expect(
      resolveLocalServiceConfig({
        ...config,
        viewerDirectory: resolve(config.viewerDirectory, "missing"),
      }),
    ).rejects.toThrow(/viewer directory/i);
  });

  it("merges partial limit overrides", async () => {
    const config = await fixture();
    await expect(
      resolveLocalServiceConfig({
        ...config,
        limits: { maxBodyBytes: 12 },
      }),
    ).resolves.toMatchObject({
      limits: { ...DEFAULT_SERVICE_LIMITS, maxBodyBytes: 12 },
    });
  });
});
