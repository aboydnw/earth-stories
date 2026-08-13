import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";

const MANIFEST_FILES = ["pixi.toml", "pixi.lock"] as const;
const CAPABILITIES = [
  "core",
  "vector",
  "raster",
  "multidim",
  "pointcloud",
] as const;

export type DesktopToolCapability = (typeof CAPABILITIES)[number];

export interface InstalledToolCapability {
  capability: DesktopToolCapability;
  bytes: number;
  destination: string;
}

export interface DesktopToolRuntimeConfiguration {
  pixiExecutable: string;
  manifestDirectory: string;
  workerDirectory: string;
  pixiHome: string;
  pixiCacheDirectory: string;
  verifyManifest(): Promise<void>;
  cleanupCapability(capability: DesktopToolCapability): Promise<void>;
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
  #prepared: DesktopToolRuntimeConfiguration | null = null;
  #verification = Promise.resolve();

  constructor(options: {
    appVersion: string;
    masterDirectory: string;
    toolsDirectory: string;
    pixiExecutable: string;
    workerDirectory: string;
    installerScript?: string;
    bootstrap?: (executable: string, signal?: AbortSignal) => Promise<void>;
  }) {
    this.#appVersion = options.appVersion;
    this.#masterDirectory = options.masterDirectory;
    this.#toolsDirectory = options.toolsDirectory;
    this.#pixiExecutable = options.pixiExecutable;
    this.#workerDirectory = options.workerDirectory;
    this.#installerScript = options.installerScript ?? null;
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
  }

  bootstrapPixi = (executable: string, signal?: AbortSignal) =>
    this.#bootstrap(executable, signal);

  async prepareRuntime(): Promise<DesktopToolRuntimeConfiguration> {
    const lock = await readFile(join(this.#masterDirectory, "pixi.lock"));
    const manifestDirectory = join(
      this.#toolsDirectory,
      `${this.#appVersion}-${digest(lock)}`,
    );
    const config: DesktopToolRuntimeConfiguration = {
      pixiExecutable: this.#pixiExecutable,
      manifestDirectory,
      workerDirectory: this.#workerDirectory,
      pixiHome: join(this.#toolsDirectory, "pixi-home"),
      pixiCacheDirectory: join(this.#toolsDirectory, "pixi-cache"),
      verifyManifest: () => this.#verifyManifest(manifestDirectory),
      cleanupCapability: (capability) =>
        rm(join(manifestDirectory, ".pixi", "envs", capability), {
          recursive: true,
          force: true,
        }),
    };
    await config.verifyManifest();
    this.#prepared = config;
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
      const environments = join(
        this.#toolsDirectory,
        tree.name,
        ".pixi",
        "envs",
      );
      const entries = await readdir(environments, {
        withFileTypes: true,
      }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || !isCapability(entry.name)) continue;
        const destination = join(environments, entry.name);
        installed.push({
          capability: entry.name,
          bytes: await directoryBytes(destination),
          destination,
        });
      }
    }
    return installed.sort((left, right) =>
      left.capability.localeCompare(right.capability),
    );
  }

  async removeCapability(capability: DesktopToolCapability): Promise<void> {
    if (!isCapability(capability))
      throw new TypeError("Unknown tool capability.");
    const installed = await this.listInstalled();
    await Promise.all(
      installed
        .filter((entry) => entry.capability === capability)
        .map((entry) =>
          rm(entry.destination, { recursive: true, force: true }),
        ),
    );
  }

  async cleanupOtherApplicationVersions(): Promise<void> {
    const entries = await readdir(this.#toolsDirectory, {
      withFileTypes: true,
    }).catch(() => []);
    const currentPrefix = `${this.#appVersion}-`;
    await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            /^[^-].*-[a-f0-9]{64}$/.test(entry.name) &&
            !entry.name.startsWith(currentPrefix),
        )
        .map((entry) =>
          rm(join(this.#toolsDirectory, entry.name), {
            recursive: true,
            force: true,
          }),
        ),
    );
  }

  async #verifyManifest(manifestDirectory: string): Promise<void> {
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
      const matches = await Promise.all(
        masters.map(async ({ name, bytes }) => {
          try {
            return (
              digest(await readFile(join(manifestDirectory, name))) ===
              digest(bytes)
            );
          } catch {
            return false;
          }
        }),
      );
      if (matches.every(Boolean)) return;
      await mkdir(manifestDirectory, { recursive: true, mode: 0o700 });
      const staged = await Promise.all(
        masters.map(async ({ name, bytes }) => {
          const temporary = join(
            manifestDirectory,
            `.${basename(name)}.${process.pid}.${randomUUID()}.tmp`,
          );
          await writeFile(temporary, bytes, { mode: 0o600 });
          if (digest(await readFile(temporary)) !== digest(bytes))
            throw new Error(`Could not verify staged ${name}.`);
          return { name, temporary };
        }),
      );
      try {
        for (const { name, temporary } of staged)
          await rename(temporary, join(manifestDirectory, name));
      } finally {
        await Promise.all(
          staged.map(({ temporary }) => rm(temporary, { force: true })),
        );
      }
      for (const { name, bytes } of masters)
        if (
          digest(await readFile(join(manifestDirectory, name))) !==
          digest(bytes)
        )
          throw new Error(`The writable ${name} does not match its master.`);
    } finally {
      release();
    }
  }
}
