import {
  chmod,
  mkdir,
  mkdtemp,
  lstat,
  readFile,
  readdir,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { DesktopTools } from "./tools.js";

async function fixture(
  options: {
    afterManifestGenerationStaged?: () => void;
    afterManifestPointerActivated?: () => void;
    beforeCapabilityRemoval?: () => Promise<void>;
    provision?: ConstructorParameters<typeof DesktopTools>[0]["provision"];
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-tools-"));
  const masters = join(root, "resources", "conversion");
  const tools = join(root, "userData", "tools");
  await mkdir(masters, { recursive: true });
  await writeFile(masters + "/pixi.toml", "[workspace]\nname='test'\n");
  await writeFile(masters + "/pixi.lock", "version: 6\nfixture: locked\n");
  await chmod(masters + "/pixi.toml", 0o444);
  await chmod(masters + "/pixi.lock", 0o444);
  const createManager = (appVersion: string) =>
    new DesktopTools({
      appVersion,
      masterDirectory: masters,
      toolsDirectory: tools,
      pixiExecutable: join(tools, "bin", "pixi"),
      workerDirectory: join(root, "resources", "conversion", "worker"),
      afterManifestGenerationStaged: options.afterManifestGenerationStaged,
      afterManifestPointerActivated: options.afterManifestPointerActivated,
      beforeCapabilityRemoval: options.beforeCapabilityRemoval,
      bootstrap: options.provision ? async () => undefined : undefined,
      provision: options.provision,
    });
  return {
    root,
    masters,
    tools,
    manager: createManager("0.1.0"),
    createManager,
  };
}

describe("DesktopTools", () => {
  it("prepares selected locked capability environments and skips installed ones", async () => {
    const provisioned: string[] = [];
    const value = await fixture({
      provision: async ({ capability, manifestDirectory }) => {
        provisioned.push(capability);
        await mkdir(join(manifestDirectory, ".pixi", "envs", capability), {
          recursive: true,
        });
        await writeFile(
          join(manifestDirectory, ".pixi", "envs", capability, "ready"),
          capability,
        );
      },
    });
    const runtime = await value.manager.prepareRuntime();
    await mkdir(join(runtime.manifestDirectory, ".pixi", "envs", "core"), {
      recursive: true,
    });

    await value.manager.prepareCapabilities(["core", "raster", "vector"]);

    expect(provisioned).toEqual(["raster", "vector"]);
    expect(
      (await value.manager.listInstalled()).map(({ capability }) => capability),
    ).toEqual(["core", "raster", "vector"]);
  });

  it("removes a partial environment after preparation fails so retry is safe", async () => {
    let attempts = 0;
    const value = await fixture({
      provision: async ({ capability, manifestDirectory }) => {
        attempts += 1;
        const environment = join(
          manifestDirectory,
          ".pixi",
          "envs",
          capability,
        );
        await mkdir(environment, { recursive: true });
        await writeFile(join(environment, "partial"), "partial");
        if (attempts === 1) throw new Error("download interrupted");
      },
    });
    const runtime = await value.manager.prepareRuntime();
    const environment = join(
      runtime.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );

    await expect(value.manager.prepareCapabilities(["raster"])).rejects.toThrow(
      "download interrupted",
    );
    await expect(stat(environment)).rejects.toThrow();
    await expect(
      value.manager.prepareCapabilities(["raster"]),
    ).resolves.toEqual([expect.objectContaining({ capability: "raster" })]);
  });

  it("copies both immutable masters into the version and full-lock-digest tree", async () => {
    const value = await fixture();

    const config = await value.manager.prepareRuntime();

    expect(config.manifestDirectory).toMatch(
      /\/tools\/0\.1\.0-[a-f0-9]{64}\/manifests\/generation-[a-f0-9-]+$/,
    );
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
    const repairedDirectory = await config.resolveManifestDirectory();

    await expect(
      readFile(join(repairedDirectory, "pixi.toml"), "utf8"),
    ).resolves.toBe("[workspace]\nname='test'\n");
    await expect(
      readFile(join(repairedDirectory, "pixi.lock"), "utf8"),
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
      expect.objectContaining({ capability: "raster", apparentBytes: 12 }),
    ]);
    await value.manager.removeCapability("raster");
    await expect(stat(environment)).rejects.toThrow();
    await expect(stat(config.manifestDirectory)).resolves.toBeTruthy();
  });

  it("counts symlink entries without following their targets", async () => {
    const value = await fixture();
    const config = await value.manager.prepareRuntime();
    const environment = join(
      config.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );
    const outside = join(value.root, "outside");
    await mkdir(environment, { recursive: true });
    await mkdir(outside);
    await writeFile(join(outside, "large.bin"), "x".repeat(10_000));
    const link = join(environment, "outside-link");
    await symlink(outside, link, "dir");

    await expect(value.manager.listInstalled()).resolves.toEqual([
      expect.objectContaining({
        capability: "raster",
        apparentBytes: (await lstat(link)).size,
      }),
    ]);
  });

  it("reuses an environment size until that environment directory changes", async () => {
    const value = await fixture();
    const config = await value.manager.prepareRuntime();
    const environment = join(
      config.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );
    await mkdir(environment, { recursive: true });
    const existing = join(environment, "one.bin");
    await writeFile(existing, "123");

    expect((await value.manager.listInstalled())[0]?.apparentBytes).toBe(3);
    await writeFile(existing, "123456");
    expect((await value.manager.listInstalled())[0]?.apparentBytes).toBe(3);
    await writeFile(join(environment, "two.bin"), "12");
    const changed = new Date(Date.now() + 2_000);
    await utimes(environment, changed, changed);
    expect((await value.manager.listInstalled())[0]?.apparentBytes).toBe(8);
  });

  it("recovers after a crash once a complete generation is staged", async () => {
    let stages = 0;
    const value = await fixture({
      afterManifestGenerationStaged: () => {
        stages += 1;
        if (stages === 2) throw new Error("staging fault");
      },
    });
    const config = await value.manager.prepareRuntime();
    await chmod(join(value.masters, "pixi.toml"), 0o644);
    await writeFile(
      join(value.masters, "pixi.toml"),
      "[workspace]\nname='next'\n",
    );

    await expect(config.verifyManifest()).rejects.toThrow("staging fault");
    const restarted = new DesktopTools({
      appVersion: "0.1.0",
      masterDirectory: value.masters,
      toolsDirectory: value.tools,
      pixiExecutable: join(value.tools, "bin", "pixi"),
      workerDirectory: join(value.root, "resources", "conversion", "worker"),
    });
    const recovered = await restarted.prepareRuntime();

    await expect(
      readFile(join(recovered.manifestDirectory, "pixi.toml"), "utf8"),
    ).resolves.toBe("[workspace]\nname='next'\n");
    await expect(
      readFile(join(recovered.manifestDirectory, "pixi.lock"), "utf8"),
    ).resolves.toBe("version: 6\nfixture: locked\n");
    await restarted.cleanupOtherApplicationVersions();
    await expect(
      readdir(join(recovered.manifestDirectory, "..")),
    ).resolves.toEqual([basename(recovered.manifestDirectory)]);
  });

  it("recovers after a crash immediately after pointer activation", async () => {
    let activations = 0;
    const value = await fixture({
      afterManifestPointerActivated: () => {
        activations += 1;
        if (activations === 2) throw new Error("pointer fault");
      },
    });
    const config = await value.manager.prepareRuntime();
    await chmod(join(value.masters, "pixi.toml"), 0o644);
    await writeFile(
      join(value.masters, "pixi.toml"),
      "[workspace]\nname='activated'\n",
    );

    await expect(config.verifyManifest()).rejects.toThrow("pointer fault");
    const restarted = new DesktopTools({
      appVersion: "0.1.0",
      masterDirectory: value.masters,
      toolsDirectory: value.tools,
      pixiExecutable: join(value.tools, "bin", "pixi"),
      workerDirectory: join(value.root, "resources", "conversion", "worker"),
    });
    const recovered = await restarted.prepareRuntime();

    await expect(
      readFile(join(recovered.manifestDirectory, "pixi.toml"), "utf8"),
    ).resolves.toBe("[workspace]\nname='activated'\n");
    await expect(
      readFile(join(recovered.manifestDirectory, "pixi.lock"), "utf8"),
    ).resolves.toBe("version: 6\nfixture: locked\n");
  });

  it("refuses removal while the capability is in active use", async () => {
    const value = await fixture();
    const config = await value.manager.prepareRuntime();
    const environment = join(
      config.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );
    await mkdir(environment, { recursive: true });
    const release = await config.acquireCapability("raster");

    await expect(value.manager.removeCapability("raster")).rejects.toThrow(
      /in use/i,
    );
    await release();
    await expect(
      value.manager.removeCapability("raster"),
    ).resolves.toBeUndefined();
  });

  it("does not grant a lease until an in-progress removal finishes", async () => {
    let removalEntered!: () => void;
    let finishRemoval!: () => void;
    const entered = new Promise<void>((resolve) => (removalEntered = resolve));
    const gate = new Promise<void>((resolve) => (finishRemoval = resolve));
    const value = await fixture({
      beforeCapabilityRemoval: async () => {
        removalEntered();
        await gate;
      },
    });
    const config = await value.manager.prepareRuntime();
    const environment = join(
      config.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );
    await mkdir(environment, { recursive: true });

    const removing = value.manager.removeCapability("raster");
    await entered;
    let acquired = false;
    const acquiring = config.acquireCapability("raster").then((release) => {
      acquired = true;
      return release;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);

    finishRemoval();
    await removing;
    const release = await acquiring;
    await expect(stat(environment)).rejects.toThrow();
    await release();
  });

  it("does not clean a failed job environment while another job holds a lease", async () => {
    const value = await fixture();
    const config = await value.manager.prepareRuntime();
    const environment = join(
      config.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );
    await mkdir(environment, { recursive: true });
    await writeFile(join(environment, "active-job.bin"), "still in use");
    const releaseFailedJob = await config.acquireCapability("raster");
    const releaseActiveJob = await config.acquireCapability("raster");

    await config.cleanupCapability("raster");

    await expect(
      stat(join(environment, "active-job.bin")),
    ).resolves.toBeTruthy();
    await releaseFailedJob();
    await releaseActiveJob();
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

  it("reuses same-lock capability environments across application upgrades", async () => {
    const value = await fixture();
    const firstManager = value.createManager("1.0.0");
    const first = await firstManager.prepareRuntime();
    const firstTree = dirname(dirname(first.manifestDirectory));
    const firstEnvironment = join(
      first.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );
    await mkdir(firstEnvironment, { recursive: true });
    await writeFile(join(firstEnvironment, "installed.bin"), "version-one");
    const secondManager = value.createManager("2.0.0");
    const second = await secondManager.prepareRuntime();

    await secondManager.cleanupOtherApplicationVersions();

    await expect(
      readFile(
        join(
          second.manifestDirectory,
          ".pixi",
          "envs",
          "raster",
          "installed.bin",
        ),
        "utf8",
      ),
    ).resolves.toBe("version-one");
    await expect(stat(firstTree)).rejects.toThrow();
  });

  it("does not reuse capability environments when the lock changes", async () => {
    const value = await fixture();
    const firstManager = value.createManager("1.0.0");
    const first = await firstManager.prepareRuntime();
    const firstTree = dirname(dirname(first.manifestDirectory));
    const firstEnvironment = join(
      first.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );
    await mkdir(firstEnvironment, { recursive: true });
    await writeFile(join(firstEnvironment, "installed.bin"), "old-lock");
    await chmod(join(value.masters, "pixi.lock"), 0o644);
    await writeFile(join(value.masters, "pixi.lock"), "version: 6\nnew lock\n");
    const secondManager = value.createManager("2.0.0");
    const second = await secondManager.prepareRuntime();

    await secondManager.cleanupOtherApplicationVersions();

    await expect(
      stat(join(second.manifestDirectory, ".pixi", "envs", "raster")),
    ).rejects.toThrow();
    await expect(stat(firstTree)).rejects.toThrow();
  });

  it("keeps current capability environments when adopting a same-lock tree", async () => {
    const value = await fixture();
    const firstManager = value.createManager("1.0.0");
    const first = await firstManager.prepareRuntime();
    const firstEnvironment = join(
      first.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );
    await mkdir(firstEnvironment, { recursive: true });
    await writeFile(join(firstEnvironment, "installed.bin"), "version-one");
    const secondManager = value.createManager("2.0.0");
    const second = await secondManager.prepareRuntime();
    const secondEnvironment = join(
      second.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );
    await mkdir(secondEnvironment, { recursive: true });
    await writeFile(join(secondEnvironment, "installed.bin"), "version-two");

    await secondManager.cleanupOtherApplicationVersions();

    await expect(
      readFile(join(secondEnvironment, "installed.bin"), "utf8"),
    ).resolves.toBe("version-two");
  });

  it("defers upgrade adoption and deletion while a capability lease is active", async () => {
    const value = await fixture();
    const firstManager = value.createManager("1.0.0");
    const first = await firstManager.prepareRuntime();
    const firstTree = dirname(dirname(first.manifestDirectory));
    const firstEnvironment = join(
      first.manifestDirectory,
      ".pixi",
      "envs",
      "raster",
    );
    await mkdir(firstEnvironment, { recursive: true });
    await writeFile(join(firstEnvironment, "installed.bin"), "version-one");
    const secondManager = value.createManager("2.0.0");
    const second = await secondManager.prepareRuntime();
    const release = await second.acquireCapability("raster");

    await secondManager.cleanupOtherApplicationVersions();

    await expect(stat(firstTree)).resolves.toBeTruthy();
    await expect(
      stat(join(second.manifestDirectory, ".pixi", "envs", "raster")),
    ).rejects.toThrow();
    await release();
    await secondManager.cleanupOtherApplicationVersions();
    await expect(
      readFile(
        join(
          second.manifestDirectory,
          ".pixi",
          "envs",
          "raster",
          "installed.bin",
        ),
        "utf8",
      ),
    ).resolves.toBe("version-one");
    await expect(stat(firstTree)).rejects.toThrow();
  });
});
