import { access, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  CONVERSION_PROTOCOL_VERSION,
  conversionJobEventSchema,
  conversionJobRequestSchema,
  type ConversionCapability,
  type ConversionJobEvent,
  type ConversionJobRequest,
} from "@earth-stories/story-schema";
import { ProcessTreeRunner } from "./process-tree.js";

export const CAPABILITY_INSTALL_ESTIMATES: Record<
  ConversionCapability,
  {
    name: string;
    estimatedBytes: number;
    estimateKind:
      | "measured-apparent-installed-footprint"
      | "estimated-apparent-installed-footprint";
  }
> = {
  core: {
    name: "Core data inspection",
    estimatedBytes: 321_812_028,
    estimateKind: "measured-apparent-installed-footprint",
  },
  vector: {
    name: "Vector preparation",
    estimatedBytes: 430_000_000,
    estimateKind: "estimated-apparent-installed-footprint",
  },
  raster: {
    name: "Raster preparation",
    estimatedBytes: 668_962_511,
    estimateKind: "measured-apparent-installed-footprint",
  },
  multidim: {
    name: "Multidimensional preparation",
    estimatedBytes: 410_000_000,
    estimateKind: "estimated-apparent-installed-footprint",
  },
  pointcloud: {
    name: "Point-cloud preparation",
    estimatedBytes: 310_000_000,
    estimateKind: "estimated-apparent-installed-footprint",
  },
};

export type LockedCapabilityVersions = Record<
  ConversionCapability,
  readonly string[]
>;

const DISCLOSED_PACKAGES: Record<
  ConversionCapability,
  ReadonlyArray<readonly [packageName: string, displayName: string]>
> = {
  core: [
    ["python", "Python"],
    ["pydantic", "Pydantic"],
  ],
  vector: [
    ["duckdb", "DuckDB"],
    ["gdal", "GDAL"],
    ["pyarrow", "PyArrow"],
  ],
  raster: [
    ["gdal", "GDAL"],
    ["rasterio", "Rasterio"],
    ["rio-cogeo", "rio-cogeo"],
  ],
  multidim: [
    ["gdal", "GDAL"],
    ["xarray", "Xarray"],
    ["zarr", "Zarr"],
  ],
  pointcloud: [
    ["pdal", "PDAL"],
    ["python-pdal", "python-pdal"],
  ],
};

function lockPlatform(): string {
  if (process.platform === "win32") return "win-64";
  if (process.platform === "darwin")
    return process.arch === "arm64" ? "osx-arm64" : "osx-64";
  return "linux-64";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseLockedCapabilityVersions(
  contents: string,
  platform = lockPlatform(),
): LockedCapabilityVersions {
  const found = Object.fromEntries(
    Object.keys(DISCLOSED_PACKAGES).map((capability) => [
      capability,
      new Map<string, string>(),
    ]),
  ) as Record<ConversionCapability, Map<string, string>>;
  let environment: ConversionCapability | null = null;
  let inPlatform = false;
  for (const line of contents.split(/\r?\n/)) {
    const environmentMatch = line.match(/^  ([a-z]+):$/);
    if (environmentMatch) {
      environment = conversionCapability(environmentMatch[1]);
      inPlatform = false;
      continue;
    }
    const platformMatch = line.match(/^      ([a-z0-9-]+):$/);
    if (platformMatch) {
      inPlatform = environment !== null && platformMatch[1] === platform;
      continue;
    }
    if (!environment || !inPlatform) continue;
    const urlMatch = line.match(/^      - conda: (https:\/\/\S+)$/);
    if (!urlMatch) continue;
    const filename = basename(new URL(urlMatch[1]).pathname);
    for (const [packageName] of DISCLOSED_PACKAGES[environment]) {
      const match = filename.match(
        new RegExp(
          `^${escapeRegex(packageName)}-([^-]+)-.+\\.(?:conda|tar\\.bz2)$`,
        ),
      );
      if (match) found[environment].set(packageName, match[1]);
    }
  }
  return Object.fromEntries(
    Object.entries(DISCLOSED_PACKAGES).map(([capability, packages]) => [
      capability,
      packages.map(([packageName, displayName]) => {
        const version =
          found[capability as ConversionCapability].get(packageName);
        if (!version)
          throw new Error(
            `pixi.lock does not pin ${packageName} for ${capability} on ${platform}.`,
          );
        return `${displayName} ${version}`;
      }),
    ]),
  ) as unknown as LockedCapabilityVersions;
}

function conversionCapability(value: string): ConversionCapability | null {
  return value in DISCLOSED_PACKAGES ? (value as ConversionCapability) : null;
}

export interface RuntimeCommand {
  executable: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  input?: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
}

export type RuntimeCommandRunner = (command: RuntimeCommand) => Promise<void>;

export class ConversionRuntime {
  readonly #pixi: string;
  readonly #manifestDirectory: string;
  readonly #resolveManifestDirectory: () => string | Promise<string>;
  readonly #workerDirectory: string;
  readonly #environment: Record<string, string> | undefined;
  readonly #run: RuntimeCommandRunner;
  readonly #forceTerminate: () => Promise<void>;
  readonly #ensureExecutable: (signal?: AbortSignal) => Promise<void>;
  readonly #verifyManifest: () => Promise<void>;
  readonly #cleanupCapability: (
    capability: ConversionCapability,
  ) => Promise<void>;
  readonly #capabilityReady: (
    capability: ConversionCapability,
  ) => Promise<boolean>;
  readonly #acquireCapability: (
    capability: ConversionCapability,
  ) => (() => void | Promise<void>) | Promise<() => void | Promise<void>>;
  readonly #lockedVersions: LockedCapabilityVersions | null;
  readonly #ready = new Set<ConversionCapability>();
  readonly #approvals = new Map<string, () => void>();

  constructor(options: {
    pixi: string;
    manifestDirectory: string;
    resolveManifestDirectory?: () => string | Promise<string>;
    workerDirectory: string;
    pixiHome: string | null;
    pixiCacheDirectory?: string | null;
    run?: RuntimeCommandRunner;
    forceTerminate?: () => Promise<void>;
    bootstrap?: (pixiExecutable: string, signal?: AbortSignal) => Promise<void>;
    executableExists?: (path: string) => Promise<boolean>;
    verifyManifest?: () => Promise<void>;
    cleanupCapability?: (capability: ConversionCapability) => Promise<void>;
    capabilityReady?: (capability: ConversionCapability) => Promise<boolean>;
    acquireCapability?: (
      capability: ConversionCapability,
    ) => Promise<() => void | Promise<void>>;
    lockedVersions?: LockedCapabilityVersions;
  }) {
    this.#pixi = options.pixi;
    this.#manifestDirectory = options.manifestDirectory;
    this.#resolveManifestDirectory =
      options.resolveManifestDirectory ?? (() => this.#manifestDirectory);
    this.#workerDirectory = options.workerDirectory;
    this.#environment = options.pixiHome
      ? {
          PIXI_HOME: options.pixiHome,
          ...(options.pixiCacheDirectory
            ? { PIXI_CACHE_DIR: options.pixiCacheDirectory }
            : {}),
        }
      : undefined;
    this.#verifyManifest = options.verifyManifest ?? (async () => undefined);
    this.#cleanupCapability =
      options.cleanupCapability ?? (async () => undefined);
    this.#capabilityReady = options.capabilityReady ?? (async () => true);
    this.#acquireCapability =
      options.acquireCapability ?? (() => () => undefined);
    this.#lockedVersions = options.lockedVersions ?? null;
    const processTrees = new ProcessTreeRunner();
    this.#run = options.run ?? ((command) => processTrees.run(command));
    this.#forceTerminate =
      options.forceTerminate ?? (() => processTrees.forceTerminate());
    const executableExists =
      options.executableExists ??
      (async (path: string) => {
        try {
          await access(path);
          return true;
        } catch {
          return false;
        }
      });
    this.#ensureExecutable = async (signal) => {
      if (await executableExists(this.#pixi)) return;
      if (!options.bootstrap)
        throw new Error(
          "Pixi is missing and this service host did not provide a bootstrap.",
        );
      await options.bootstrap(this.#pixi, signal);
    };
  }

  forceTerminate(): Promise<void> {
    return this.#forceTerminate();
  }

  acknowledgeProvisioning(requestId: string): boolean {
    const approve = this.#approvals.get(requestId);
    if (!approve) return false;
    approve();
    return true;
  }

  async #waitForApproval(
    requestId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw abortError();
    await new Promise<void>((resolveApproval, rejectApproval) => {
      const onAbort = () => {
        this.#approvals.delete(requestId);
        rejectApproval(abortError());
      };
      const approve = () => {
        this.#approvals.delete(requestId);
        signal?.removeEventListener("abort", onAbort);
        resolveApproval();
      };
      this.#approvals.set(requestId, approve);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  async provision(
    capability: ConversionCapability,
    requestId: string,
    onEvent: (event: ConversionJobEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.#ready.has(capability)) {
      if (await this.#capabilityReady(capability)) return;
      this.#ready.delete(capability);
    }
    const initialManifestResolution = this.#resolveManifestDirectory();
    const initialManifestDirectory =
      typeof initialManifestResolution === "string"
        ? initialManifestResolution
        : await initialManifestResolution;
    const disclosure = CAPABILITY_INSTALL_ESTIMATES[capability];
    const lockedVersions =
      this.#lockedVersions ??
      parseLockedCapabilityVersions(
        await readFile(join(initialManifestDirectory, "pixi.lock"), "utf8"),
      );
    const versions = lockedVersions[capability];
    onEvent({
      protocol: CONVERSION_PROTOCOL_VERSION,
      requestId,
      type: "provisioning-disclosure",
      capability,
      capabilityName: disclosure.name,
      versions: [...versions],
      estimatedBytes: disclosure.estimatedBytes,
      estimateKind: disclosure.estimateKind,
      destination: join(initialManifestDirectory, ".pixi", "envs", capability),
      credits: [
        { name: "Pixi", license: "BSD-3-Clause" },
        {
          name: "conda-forge packages",
          license: "See the pinned pixi.lock and third-party notices",
        },
      ],
    });
    await this.#waitForApproval(requestId, signal);
    const total = disclosure.estimatedBytes;
    onEvent({
      protocol: CONVERSION_PROTOCOL_VERSION,
      requestId,
      type: "progress",
      stage: "provisioning",
      completed: 0,
      total,
      unit: "bytes",
      message: `Installing ${disclosure.name} (estimated ${Math.ceil(total / 1_000_000)} MB apparent file size)`,
    });
    try {
      await this.#ensureExecutable(signal);
      await this.#verifyManifest();
      const manifestDirectory = await this.#resolveManifestDirectory();
      await this.#run({
        executable: this.#pixi,
        cwd: manifestDirectory,
        env: this.#environment,
        args: [
          "install",
          "--manifest-path",
          join(manifestDirectory, "pixi.toml"),
          "--locked",
          "-e",
          capability,
        ],
        signal,
      });
    } catch (cause) {
      await this.#cleanupCapability(capability);
      throw cause;
    }
    this.#ready.add(capability);
    onEvent({
      protocol: CONVERSION_PROTOCOL_VERSION,
      requestId,
      type: "progress",
      stage: "provisioning",
      completed: total,
      total,
      unit: "bytes",
      message: `${disclosure.name} tools are ready`,
    });
  }

  async execute(
    input: unknown,
    onEvent: (event: ConversionJobEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const request: ConversionJobRequest =
      conversionJobRequestSchema.parse(input);
    const acquisition = this.#acquireCapability(request.capability);
    const releaseCapability =
      acquisition instanceof Promise ? await acquisition : acquisition;
    try {
      await this.provision(
        request.capability,
        request.requestId,
        onEvent,
        signal,
      );
      await this.#verifyManifest();
      const manifestDirectory = await this.#resolveManifestDirectory();
      let buffered = "";
      let parseFailure: unknown;
      await this.#run({
        executable: this.#pixi,
        cwd: manifestDirectory,
        env: this.#environment,
        args: [
          "run",
          "--manifest-path",
          join(manifestDirectory, "pixi.toml"),
          "--locked",
          "-e",
          request.capability,
          "python",
          join(this.#workerDirectory, "worker.py"),
        ],
        input: `${JSON.stringify(request)}\n`,
        signal,
        onStdout: (chunk) => {
          if (parseFailure) return;
          buffered += chunk;
          const lines = buffered.split("\n");
          buffered = lines.pop() ?? "";
          try {
            for (const line of lines) {
              if (line.trim())
                onEvent(conversionJobEventSchema.parse(JSON.parse(line)));
            }
          } catch (cause) {
            parseFailure = cause;
          }
        },
      });
      if (parseFailure) throw parseFailure;
      if (buffered.trim()) {
        try {
          onEvent(conversionJobEventSchema.parse(JSON.parse(buffered)));
        } catch (cause) {
          throw new Error("The conversion worker returned an invalid event.", {
            cause,
          });
        }
      }
    } finally {
      await releaseCapability();
    }
  }
}

function abortError(): Error {
  const error = new Error("Provisioning was cancelled.");
  error.name = "AbortError";
  return error;
}
