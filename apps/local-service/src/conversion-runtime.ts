import { access } from "node:fs/promises";
import { join } from "node:path";
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
      "measured-installed-footprint" | "estimated-installed-footprint";
    versions: string[];
  }
> = {
  core: {
    name: "Core data inspection",
    estimatedBytes: 321_812_028,
    estimateKind: "measured-installed-footprint",
    versions: ["Python 3.12.*", "Pydantic >=2.11,<3"],
  },
  vector: {
    name: "Vector preparation",
    estimatedBytes: 430_000_000,
    estimateKind: "estimated-installed-footprint",
    versions: ["DuckDB >=1.3,<2", "GDAL >=3.10,<4", "PyArrow >=20,<23"],
  },
  raster: {
    name: "Raster preparation",
    estimatedBytes: 668_962_511,
    estimateKind: "measured-installed-footprint",
    versions: ["GDAL >=3.10,<4", "Rasterio >=1.4,<2", "rio-cogeo >=5.4,<6"],
  },
  multidim: {
    name: "Multidimensional preparation",
    estimatedBytes: 410_000_000,
    estimateKind: "estimated-installed-footprint",
    versions: ["GDAL >=3.10,<4", "Xarray >=2025.6,<2027", "Zarr >=3,<4"],
  },
  pointcloud: {
    name: "Point-cloud preparation",
    estimatedBytes: 310_000_000,
    estimateKind: "estimated-installed-footprint",
    versions: ["PDAL >=2.9,<3", "python-pdal >=3.5,<4"],
  },
};

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
  readonly #workerDirectory: string;
  readonly #environment: Record<string, string> | undefined;
  readonly #run: RuntimeCommandRunner;
  readonly #forceTerminate: () => Promise<void>;
  readonly #ensureExecutable: (signal?: AbortSignal) => Promise<void>;
  readonly #verifyManifest: () => Promise<void>;
  readonly #cleanupCapability: (
    capability: ConversionCapability,
  ) => Promise<void>;
  readonly #ready = new Set<ConversionCapability>();
  readonly #approvals = new Map<string, () => void>();

  constructor(options: {
    pixi: string;
    manifestDirectory: string;
    workerDirectory: string;
    pixiHome: string | null;
    pixiCacheDirectory?: string | null;
    run?: RuntimeCommandRunner;
    forceTerminate?: () => Promise<void>;
    bootstrap?: (pixiExecutable: string, signal?: AbortSignal) => Promise<void>;
    executableExists?: (path: string) => Promise<boolean>;
    verifyManifest?: () => Promise<void>;
    cleanupCapability?: (capability: ConversionCapability) => Promise<void>;
  }) {
    this.#pixi = options.pixi;
    this.#manifestDirectory = options.manifestDirectory;
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
    if (this.#ready.has(capability)) return;
    const disclosure = CAPABILITY_INSTALL_ESTIMATES[capability];
    onEvent({
      protocol: CONVERSION_PROTOCOL_VERSION,
      requestId,
      type: "provisioning-disclosure",
      capability,
      capabilityName: disclosure.name,
      versions: disclosure.versions,
      estimatedBytes: disclosure.estimatedBytes,
      estimateKind: disclosure.estimateKind,
      destination: join(this.#manifestDirectory, ".pixi", "envs", capability),
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
      message: `Installing ${disclosure.name} (estimated ${Math.ceil(total / 1_000_000)} MB on disk)`,
    });
    try {
      await this.#ensureExecutable(signal);
      await this.#verifyManifest();
      await this.#run({
        executable: this.#pixi,
        cwd: this.#manifestDirectory,
        env: this.#environment,
        args: [
          "install",
          "--manifest-path",
          join(this.#manifestDirectory, "pixi.toml"),
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
    await this.provision(
      request.capability,
      request.requestId,
      onEvent,
      signal,
    );
    await this.#verifyManifest();
    let buffered = "";
    let parseFailure: unknown;
    await this.#run({
      executable: this.#pixi,
      cwd: this.#manifestDirectory,
      env: this.#environment,
      args: [
        "run",
        "--manifest-path",
        join(this.#manifestDirectory, "pixi.toml"),
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
  }
}

function abortError(): Error {
  const error = new Error("Provisioning was cancelled.");
  error.name = "AbortError";
  return error;
}
