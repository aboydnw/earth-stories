import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  CONVERSION_CAPABILITIES,
  type ConversionCapability,
} from "@earth-stories/story-schema";

const MANIFEST_FILES = ["pixi.toml", "pixi.lock"] as const;
const CAPABILITIES = CONVERSION_CAPABILITIES;

export type DesktopToolCapability = ConversionCapability;

export interface ProvisionDesktopCapabilityOptions {
  capability: DesktopToolCapability;
  manifestDirectory: string;
  pixiExecutable: string;
  pixiHome: string;
  pixiCacheDirectory: string;
}

export interface InstalledToolCapability {
  capability: DesktopToolCapability;
  apparentBytes: number;
  destination: string;
}

export interface DesktopToolRuntimeConfiguration {
  pixiExecutable: string;
  manifestDirectory: string;
  resolveManifestDirectory(): Promise<string>;
  workerDirectory: string;
  pixiHome: string;
  pixiCacheDirectory: string;
  verifyManifest(): Promise<void>;
  cleanupCapability(capability: DesktopToolCapability): Promise<void>;
  capabilityReady(capability: DesktopToolCapability): Promise<boolean>;
  acquireCapability(
    capability: DesktopToolCapability,
  ): Promise<() => Promise<void>>;
}

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function directoryBytes(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

function isCapability(value: string): value is DesktopToolCapability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export class DesktopTools {
  readonly #appVersion: string;
  readonly #masterDirectory: string;
  readonly #toolsDirectory: string;
  readonly #pixiExecutable: string;
  readonly #workerDirectory: string;
  readonly #installerScript: string | null;
  readonly #bootstrap: (
    executable: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly #provision: (
    options: ProvisionDesktopCapabilityOptions,
  ) => Promise<void>;
  readonly #afterManifestGenerationStaged: () => void;
  readonly #afterManifestPointerActivated: () => void;
  readonly #beforeCapabilityRemoval: () => Promise<void>;
  readonly #activeCapabilities = new Map<DesktopToolCapability, number>();
  readonly #capabilityOperations = new Map<
    DesktopToolCapability,
    Promise<void>
  >();
  #verification = Promise.resolve();

  constructor(options: {
    appVersion: string;
    masterDirectory: string;
    toolsDirectory: string;
    pixiExecutable: string;
    workerDirectory: string;
    installerScript?: string;
    bootstrap?: (executable: string, signal?: AbortSignal) => Promise<void>;
    provision?: (options: ProvisionDesktopCapabilityOptions) => Promise<void>;
    afterManifestGenerationStaged?: () => void;
    afterManifestPointerActivated?: () => void;
    beforeCapabilityRemoval?: () => Promise<void>;
  }) {
    this.#appVersion = options.appVersion;
    this.#masterDirectory = options.masterDirectory;
    this.#toolsDirectory = options.toolsDirectory;
    this.#pixiExecutable = options.pixiExecutable;
    this.#workerDirectory = options.workerDirectory;
    this.#installerScript = options.installerScript ?? null;
    this.#afterManifestGenerationStaged =
      options.afterManifestGenerationStaged ?? (() => undefined);
    this.#afterManifestPointerActivated =
      options.afterManifestPointerActivated ?? (() => undefined);
    this.#beforeCapabilityRemoval =
      options.beforeCapabilityRemoval ?? (() => Promise.resolve());
    this.#bootstrap =
      options.bootstrap ??
      ((executable, signal) => {
        if (!this.#installerScript)
          throw new Error("The Pixi installer resource is unavailable.");
        return new Promise<void>((resolveBootstrap, rejectBootstrap) => {
          const child = spawn(
            process.execPath,
            [this.#installerScript!, executable],
            {
              env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
              signal,
              stdio: "ignore",
            },
          );
          child.once("error", rejectBootstrap);
          child.once("exit", (code) => {
            if (code === 0) resolveBootstrap();
            else
              rejectBootstrap(
                new Error(`Pixi bootstrap exited with code ${code}.`),
              );
          });
        });
      });
    this.#provision =
      options.provision ??
      ((request) =>
        new Promise<void>((resolveProvision, rejectProvision) => {
          const child = spawn(
            request.pixiExecutable,
            [
              "install",
              "--manifest-path",
              join(request.manifestDirectory, "pixi.toml"),
              "--locked",
              "-e",
              request.capability,
            ],
            {
              cwd: request.manifestDirectory,
              env: {
                ...process.env,
                PIXI_HOME: request.pixiHome,
                PIXI_CACHE_DIR: request.pixiCacheDirectory,
              },
              stdio: "ignore",
            },
          );
          child.once("error", rejectProvision);
          child.once("exit", (code) => {
            if (code === 0) resolveProvision();
            else
              rejectProvision(
                new Error(
                  `Pixi could not prepare ${request.capability} tools (exit ${code}).`,
                ),
              );
          });
        }));
  }

  bootstrapPixi = (executable: string, signal?: AbortSignal) =>
    this.#bootstrap(executable, signal);

  async prepareRuntime(): Promise<DesktopToolRuntimeConfiguration> {
    const lock = await readFile(join(this.#masterDirectory, "pixi.lock"));
    const treeDirectory = join(
      this.#toolsDirectory,
      `${this.#appVersion}-${digest(lock)}`,
    );
    const manifestDirectory = await this.#resolveManifest(treeDirectory);
    const config: DesktopToolRuntimeConfiguration = {
      pixiExecutable: this.#pixiExecutable,
      manifestDirectory,
      workerDirectory: this.#workerDirectory,
      pixiHome: join(this.#toolsDirectory, "pixi-home"),
      pixiCacheDirectory: join(this.#toolsDirectory, "pixi-cache"),
      resolveManifestDirectory: () => this.#resolveManifest(treeDirectory),
      verifyManifest: async () => {
        await this.#resolveManifest(treeDirectory);
      },
      cleanupCapability: (capability) =>
        this.#withCapabilityLock(capability, async () => {
          if ((this.#activeCapabilities.get(capability) ?? 0) > 1) return;
          await rm(
            join(
              await this.#resolveManifest(treeDirectory),
              ".pixi",
              "envs",
              capability,
            ),
            {
              recursive: true,
              force: true,
            },
          );
        }),
      capabilityReady: async (capability) => {
        try {
          return (
            await stat(
              join(
                await this.#resolveManifest(treeDirectory),
                ".pixi",
                "envs",
                capability,
              ),
            )
          ).isDirectory();
        } catch {
          return false;
        }
      },
      acquireCapability: async (capability) => {
        await this.#withCapabilityLock(capability, () => {
          this.#activeCapabilities.set(
            capability,
            (this.#activeCapabilities.get(capability) ?? 0) + 1,
          );
        });
        let released = false;
        return async () => {
          if (released) return;
          released = true;
          await this.#withCapabilityLock(capability, () => {
            const remaining =
              (this.#activeCapabilities.get(capability) ?? 1) - 1;
            if (remaining === 0) this.#activeCapabilities.delete(capability);
            else this.#activeCapabilities.set(capability, remaining);
          });
        };
      },
    };
    return config;
  }

  async listInstalled(): Promise<InstalledToolCapability[]> {
    const installed: InstalledToolCapability[] = [];
    const prefix = `${this.#appVersion}-`;
    const trees = await readdir(this.#toolsDirectory, {
      withFileTypes: true,
    }).catch(() => []);
    for (const tree of trees) {
      if (!tree.isDirectory() || !tree.name.startsWith(prefix)) continue;
      const treeDirectory = join(this.#toolsDirectory, tree.name);
      const activeManifest = await this.#readActiveManifest(treeDirectory);
      if (!activeManifest) continue;
      const environments = join(activeManifest, ".pixi", "envs");
      const entries = await readdir(environments, {
        withFileTypes: true,
      }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || !isCapability(entry.name)) continue;
        const destination = join(environments, entry.name);
        installed.push({
          capability: entry.name,
          apparentBytes: await directoryBytes(destination),
          destination,
        });
      }
    }
    return installed.sort((left, right) =>
      left.capability.localeCompare(right.capability),
    );
  }

  async prepareCapabilities(
    capabilities: DesktopToolCapability[],
  ): Promise<InstalledToolCapability[]> {
    const requested = [...new Set(capabilities)];
    for (const capability of requested) {
      if (!isCapability(capability))
        throw new TypeError("Unknown tool capability.");
      await this.#withCapabilityLock(capability, async () => {
        const runtime = await this.prepareRuntime();
        if (await runtime.capabilityReady(capability)) return;
        if ((this.#activeCapabilities.get(capability) ?? 0) > 0)
          throw new Error(
            `${capability} tools are in use and cannot be prepared.`,
          );
        try {
          await access(this.#pixiExecutable);
        } catch {
          await this.#bootstrap(this.#pixiExecutable);
        }
        try {
          await this.#provision({
            capability,
            manifestDirectory: runtime.manifestDirectory,
            pixiExecutable: runtime.pixiExecutable,
            pixiHome: runtime.pixiHome,
            pixiCacheDirectory: runtime.pixiCacheDirectory,
          });
          if (!(await runtime.capabilityReady(capability)))
            throw new Error(
              `Pixi finished without creating the ${capability} environment.`,
            );
        } catch (cause) {
          await rm(
            join(runtime.manifestDirectory, ".pixi", "envs", capability),
            { recursive: true, force: true },
          );
          throw cause;
        }
      });
    }
    return this.listInstalled();
  }

  async removeCapability(capability: DesktopToolCapability): Promise<void> {
    if (!isCapability(capability))
      throw new TypeError("Unknown tool capability.");
    await this.#withCapabilityLock(capability, async () => {
      if ((this.#activeCapabilities.get(capability) ?? 0) > 0)
        throw new Error(
          `${capability} tools are in use and cannot be removed.`,
        );
      await this.#beforeCapabilityRemoval();
      const installed = await this.listInstalled();
      await Promise.all(
        installed
          .filter((entry) => entry.capability === capability)
          .map((entry) =>
            rm(entry.destination, { recursive: true, force: true }),
          ),
      );
    });
  }

  async cleanupOtherApplicationVersions(): Promise<void> {
    await this.#withAllCapabilityLocks(async () => {
      if (
        CAPABILITIES.some(
          (capability) => (this.#activeCapabilities.get(capability) ?? 0) > 0,
        )
      )
        return;
      const entries = await readdir(this.#toolsDirectory, {
        withFileTypes: true,
      }).catch(() => []);
      const currentPrefix = `${this.#appVersion}-`;
      const lock = await readFile(join(this.#masterDirectory, "pixi.lock"));
      const lockDigest = digest(lock);
      const currentTree = join(
        this.#toolsDirectory,
        `${currentPrefix}${lockDigest}`,
      );
      const currentManifest = await this.#resolveManifest(currentTree);
      const previousTrees = entries.filter(
        (entry) =>
          entry.isDirectory() &&
          /^[^-].*-[a-f0-9]{64}$/.test(entry.name) &&
          !entry.name.startsWith(currentPrefix),
      );
      for (const entry of previousTrees) {
        if (!entry.name.endsWith(`-${lockDigest}`)) continue;
        const previousManifest = await this.#readActiveManifest(
          join(this.#toolsDirectory, entry.name),
        );
        if (!previousManifest) continue;
        await mkdir(join(currentManifest, ".pixi", "envs"), {
          recursive: true,
        });
        for (const capability of CAPABILITIES) {
          const source = join(previousManifest, ".pixi", "envs", capability);
          const destination = join(
            currentManifest,
            ".pixi",
            "envs",
            capability,
          );
          try {
            await stat(destination);
            continue;
          } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
          }
          await rename(source, destination).catch((cause) => {
            if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
          });
        }
      }
      await Promise.all(
        previousTrees.map((entry) =>
          rm(join(this.#toolsDirectory, entry.name), {
            recursive: true,
            force: true,
          }),
        ),
      );
      await Promise.all(
        entries
          .filter(
            (entry) =>
              entry.isDirectory() && entry.name.startsWith(currentPrefix),
          )
          .map((entry) =>
            this.#cleanupInactiveGenerations(
              join(this.#toolsDirectory, entry.name),
            ),
          ),
      );
    });
  }

  #withAllCapabilityLocks<T>(action: () => Promise<T>): Promise<T> {
    const run = (index: number): Promise<T> =>
      index === CAPABILITIES.length
        ? action()
        : this.#withCapabilityLock(CAPABILITIES[index], () => run(index + 1));
    return run(0);
  }

  async #cleanupInactiveGenerations(treeDirectory: string): Promise<void> {
    const activeManifest = await this.#readActiveManifest(treeDirectory);
    if (!activeManifest) return;
    const manifestsDirectory = join(treeDirectory, "manifests");
    const activeName = activeManifest.slice(manifestsDirectory.length + 1);
    const entries = await readdir(manifestsDirectory, {
      withFileTypes: true,
    }).catch(() => []);
    await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            entry.name !== activeName &&
            (entry.name.startsWith("generation-") ||
              entry.name.startsWith(".staging-")),
        )
        .map((entry) =>
          rm(join(manifestsDirectory, entry.name), {
            recursive: true,
            force: true,
          }),
        ),
    );
  }

  async #withCapabilityLock<T>(
    capability: DesktopToolCapability,
    action: () => T | Promise<T>,
  ): Promise<T> {
    const previous =
      this.#capabilityOperations.get(capability) ?? Promise.resolve();
    let unlock!: () => void;
    const current = new Promise<void>((resolve) => (unlock = resolve));
    const tail = previous.then(() => current);
    this.#capabilityOperations.set(capability, tail);
    await previous;
    try {
      return await action();
    } finally {
      unlock();
      if (this.#capabilityOperations.get(capability) === tail)
        this.#capabilityOperations.delete(capability);
    }
  }

  async #readActiveManifest(treeDirectory: string): Promise<string | null> {
    try {
      const pointer = JSON.parse(
        await readFile(join(treeDirectory, "active-manifest.json"), "utf8"),
      ) as { generation?: unknown };
      if (
        typeof pointer.generation !== "string" ||
        !/^generation-[a-f0-9-]+$/.test(pointer.generation)
      )
        return null;
      const manifestDirectory = join(
        treeDirectory,
        "manifests",
        pointer.generation,
      );
      await Promise.all(
        MANIFEST_FILES.map((name) => stat(join(manifestDirectory, name))),
      );
      return manifestDirectory;
    } catch {
      return null;
    }
  }

  async #resolveManifest(treeDirectory: string): Promise<string> {
    const previous = this.#verification;
    let release!: () => void;
    this.#verification = new Promise<void>((resolve) => (release = resolve));
    await previous;
    try {
      const masters = await Promise.all(
        MANIFEST_FILES.map(async (name) => ({
          name,
          bytes: await readFile(join(this.#masterDirectory, name)),
        })),
      );
      const activeManifest = await this.#readActiveManifest(treeDirectory);
      if (activeManifest) {
        const matches = await Promise.all(
          masters.map(
            async ({ name, bytes }) =>
              digest(await readFile(join(activeManifest, name))) ===
              digest(bytes),
          ),
        );
        if (matches.every(Boolean)) return activeManifest;
      }
      const manifestsDirectory = join(treeDirectory, "manifests");
      await mkdir(manifestsDirectory, { recursive: true, mode: 0o700 });
      const staleEntries = await readdir(manifestsDirectory, {
        withFileTypes: true,
      });
      await Promise.all(
        staleEntries
          .filter(
            (entry) =>
              entry.isDirectory() && entry.name.startsWith(".staging-"),
          )
          .map((entry) =>
            rm(join(manifestsDirectory, entry.name), {
              recursive: true,
              force: true,
            }),
          ),
      );
      const identifier = randomUUID();
      const staged = join(manifestsDirectory, `.staging-${identifier}`);
      const generationName = `generation-${identifier}`;
      const generation = join(manifestsDirectory, generationName);
      const pointerTemporary = join(
        treeDirectory,
        `.active-manifest-${identifier}.json`,
      );
      await mkdir(staged, { mode: 0o700 });
      try {
        for (const { name, bytes } of masters) {
          await writeFile(join(staged, name), bytes, { mode: 0o600 });
          if (digest(await readFile(join(staged, name))) !== digest(bytes))
            throw new Error(`Could not verify staged ${name}.`);
        }
        await rename(staged, generation);
        this.#afterManifestGenerationStaged();
        const pointerBytes = `${JSON.stringify({ generation: generationName })}\n`;
        await writeFile(pointerTemporary, pointerBytes, { mode: 0o600 });
        if ((await readFile(pointerTemporary, "utf8")) !== pointerBytes)
          throw new Error("Could not verify the staged manifest pointer.");
        await rename(
          pointerTemporary,
          join(treeDirectory, "active-manifest.json"),
        );
        this.#afterManifestPointerActivated();
      } finally {
        await rm(staged, { recursive: true, force: true });
        await rm(pointerTemporary, { force: true });
      }
      for (const { name, bytes } of masters)
        if (digest(await readFile(join(generation, name))) !== digest(bytes))
          throw new Error(`The writable ${name} does not match its master.`);
      return generation;
    } finally {
      release();
    }
  }
}
