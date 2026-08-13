import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DesktopTools } from "./tools.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-tools-"));
  const masters = join(root, "resources", "conversion");
  const tools = join(root, "userData", "tools");
  await mkdir(masters, { recursive: true });
  await writeFile(masters + "/pixi.toml", "[workspace]\nname='test'\n");
  await writeFile(masters + "/pixi.lock", "version: 6\nfixture: locked\n");
  await chmod(masters + "/pixi.toml", 0o444);
  await chmod(masters + "/pixi.lock", 0o444);
  return {
    root,
    masters,
    tools,
    manager: new DesktopTools({
      appVersion: "0.1.0",
      masterDirectory: masters,
      toolsDirectory: tools,
      pixiExecutable: join(tools, "bin", "pixi"),
      workerDirectory: join(root, "resources", "conversion", "worker"),
    }),
  };
}

describe("DesktopTools", () => {
  it("copies both immutable masters into the version and full-lock-digest tree", async () => {
    const value = await fixture();

    const config = await value.manager.prepareRuntime();

    expect(config.manifestDirectory).toMatch(/\/tools\/0\.1\.0-[a-f0-9]{64}$/);
    await expect(
      readFile(join(config.manifestDirectory, "pixi.toml"), "utf8"),
    ).resolves.toBe("[workspace]\nname='test'\n");
    await expect(
      readFile(join(config.manifestDirectory, "pixi.lock"), "utf8"),
    ).resolves.toBe("version: 6\nfixture: locked\n");
    expect(config.pixiHome).toBe(join(value.tools, "pixi-home"));
    expect(config.pixiCacheDirectory).toBe(join(value.tools, "pixi-cache"));
  });

  it("atomically restores both copies when either writable copy is tampered", async () => {
    const value = await fixture();
    const config = await value.manager.prepareRuntime();
    await writeFile(join(config.manifestDirectory, "pixi.toml"), "tampered");
    await writeFile(
      join(config.manifestDirectory, "pixi.lock"),
      "also changed",
    );

    await config.verifyManifest();

    await expect(
      readFile(join(config.manifestDirectory, "pixi.toml"), "utf8"),
    ).resolves.toBe("[workspace]\nname='test'\n");
    await expect(
      readFile(join(config.manifestDirectory, "pixi.lock"), "utf8"),
    ).resolves.toBe("version: 6\nfixture: locked\n");
  });

  it("does not mutate read-only masters or the author's Pixi profile", async () => {
    const value = await fixture();
    const authorPixi = join(value.root, "home", ".pixi", "config.toml");
    await mkdir(join(value.root, "home", ".pixi"), { recursive: true });
    await writeFile(authorPixi, "author-bytes\n");
    const beforeManifest = await readFile(join(value.masters, "pixi.toml"));
    const beforeLock = await readFile(join(value.masters, "pixi.lock"));

    const config = await value.manager.prepareRuntime();
    await config.verifyManifest();

    expect(await readFile(join(value.masters, "pixi.toml"))).toEqual(
      beforeManifest,
    );
    expect(await readFile(join(value.masters, "pixi.lock"))).toEqual(
      beforeLock,
    );
    await expect(readFile(authorPixi, "utf8")).resolves.toBe("author-bytes\n");
  });

  it("reuses the same version and lock tree but changes trees with the lock", async () => {
    const value = await fixture();
    const first = await value.manager.prepareRuntime();
    const second = await value.manager.prepareRuntime();
    await chmod(join(value.masters, "pixi.lock"), 0o644);
    await writeFile(join(value.masters, "pixi.lock"), "version: 6\nnew lock\n");
    const changed = await value.manager.prepareRuntime();

    expect(second.manifestDirectory).toBe(first.manifestDirectory);
    expect(changed.manifestDirectory).not.toBe(first.manifestDirectory);
  });

  it("reports actual capability bytes, removes one capability, and preserves current trees during provisioning", async () => {
    const value = await fixture();
    const config = await value.manager.prepareRuntime();
    const environment = join(
      config.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );
    await mkdir(join(environment, "nested"), { recursive: true });
    await writeFile(join(environment, "one.bin"), "12345");
    await writeFile(join(environment, "nested", "two.bin"), "1234567");

    expect(await value.manager.listInstalled()).toEqual([
      expect.objectContaining({ capability: "raster", bytes: 12 }),
    ]);
    await value.manager.removeCapability("raster");
    await expect(stat(environment)).rejects.toThrow();
    await expect(stat(config.manifestDirectory)).resolves.toBeTruthy();
  });

  it("cleans only other application-version trees after a successful launch", async () => {
    const value = await fixture();
    const config = await value.manager.prepareRuntime();
    const old = join(value.tools, `0.0.9-${"a".repeat(64)}`);
    const sameVersionOldLock = join(value.tools, `0.1.0-${"b".repeat(64)}`);
    await mkdir(old, { recursive: true });
    await mkdir(sameVersionOldLock, { recursive: true });
    await value.manager.cleanupOtherApplicationVersions();

    await expect(stat(old)).rejects.toThrow();
    await expect(stat(sameVersionOldLock)).resolves.toBeTruthy();
    await expect(stat(config.manifestDirectory)).resolves.toBeTruthy();
  });
});
