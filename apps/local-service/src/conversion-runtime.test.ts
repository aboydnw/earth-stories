import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { ConversionJobEvent } from "@earth-stories/story-schema";
import {
  CAPABILITY_INSTALL_ESTIMATES,
  ConversionRuntime,
  parseLockedCapabilityVersions,
  type RuntimeCommand,
} from "./conversion-runtime.js";

const request = {
  protocol: "earth-stories/conversion/v1",
  requestId: "request-1",
  projectId: "project-1",
  operation: "inspect",
  capability: "vector",
  input: {
    path: "/tmp/places.geojson",
    filename: "places.geojson",
    sizeBytes: 120,
    mediaType: "application/geo+json",
  },
  options: {},
} as const;

describe("ConversionRuntime", () => {
  const lockedVersions = {
    core: ["Python 3.12.13", "Pydantic 2.13.4"],
    vector: ["DuckDB 1.5.5", "GDAL 3.13.2", "PyArrow 22.0.0"],
    raster: ["GDAL 3.12.3", "Rasterio 1.5.0", "rio-cogeo 5.4.2"],
    multidim: ["GDAL 3.12.3", "Xarray 2026.7.0", "Zarr 3.3.0"],
    pointcloud: ["PDAL 2.10.2", "python-pdal 3.5.5"],
  } as const;

  it("derives exact representative capability versions from the selected lock environment", async () => {
    const versions = parseLockedCapabilityVersions(
      await readFile("pixi.lock", "utf8"),
      "linux-64",
    );

    expect(versions.raster).toEqual([
      "GDAL 3.12.3",
      "Rasterio 1.5.0",
      "rio-cogeo 5.4.2",
    ]);
    expect(versions.pointcloud).toEqual(["PDAL 2.10.2", "python-pdal 3.5.5"]);
  });
  it("discloses and provisions a capability only once", async () => {
    const commands: RuntimeCommand[] = [];
    const events: ConversionJobEvent[] = [];
    const runtime = new ConversionRuntime({
      pixi: "/tools/pixi",
      manifestDirectory: "/writable/manifest",
      workerDirectory: "/read-only/worker",
      pixiHome: "/workspace/pixi-home",
      pixiCacheDirectory: "/workspace/pixi-cache",
      verifyManifest: async () => undefined,
      lockedVersions,
      bootstrap: async () => undefined,
      run: async (command) => {
        commands.push(command);
        if (command.args[0] === "run")
          command.onStdout?.(
            `${JSON.stringify({
              protocol: "earth-stories/conversion/v1",
              requestId: "request-1",
              type: "result",
              status: "succeeded",
              output: { format: "vector" },
              tools: [],
              warnings: [],
            })}\n`,
          );
      },
    });

    const first = runtime.execute(request, (event) => events.push(event));
    expect(commands).toHaveLength(0);
    expect(events[0]).toMatchObject({
      type: "provisioning-disclosure",
      capabilityName: "Vector preparation",
      estimatedBytes: CAPABILITY_INSTALL_ESTIMATES.vector.estimatedBytes,
      destination: "/writable/manifest/.pixi/envs/vector",
      versions: ["DuckDB 1.5.5", "GDAL 3.13.2", "PyArrow 22.0.0"],
    });
    expect(runtime.acknowledgeProvisioning("request-1")).toBe(true);
    await first;
    await runtime.execute(request, (event) => events.push(event));

    expect(
      commands.filter((command) => command.args[0] === "install"),
    ).toHaveLength(1);
    expect(events.filter((event) => event.type === "result")).toHaveLength(2);
    expect(commands[0]).toMatchObject({
      cwd: "/writable/manifest",
      env: {
        PIXI_HOME: "/workspace/pixi-home",
        PIXI_CACHE_DIR: "/workspace/pixi-cache",
      },
      args: [
        "install",
        "--manifest-path",
        "/writable/manifest/pixi.toml",
        "--locked",
        "-e",
        "vector",
      ],
    });
    expect(commands[1]).toMatchObject({
      cwd: "/writable/manifest",
      env: { PIXI_HOME: "/workspace/pixi-home" },
      args: [
        "run",
        "--manifest-path",
        "/writable/manifest/pixi.toml",
        "--locked",
        "-e",
        "vector",
        "python",
        "/read-only/worker/worker.py",
      ],
    });
  });

  it("re-resolves the active manifest generation before every command", async () => {
    const commands: RuntimeCommand[] = [];
    const generations = [
      "/tools/tree/manifests/generation-one",
      "/tools/tree/manifests/generation-two",
      "/tools/tree/manifests/generation-three",
    ];
    const runtime = new ConversionRuntime({
      pixi: "/tools/pixi",
      manifestDirectory: generations[0],
      resolveManifestDirectory: () => generations.shift() ?? "/unexpected",
      workerDirectory: "/worker",
      pixiHome: null,
      lockedVersions,
      bootstrap: async () => undefined,
      run: async (command) => {
        commands.push(command);
      },
    });

    const execution = runtime.execute(request, () => undefined);
    expect(runtime.acknowledgeProvisioning("request-1")).toBe(true);
    await execution;

    expect(commands.map((command) => command.cwd)).toEqual([
      "/tools/tree/manifests/generation-two",
      "/tools/tree/manifests/generation-three",
    ]);
    expect(commands.map((command) => command.args[2])).toEqual([
      "/tools/tree/manifests/generation-two/pixi.toml",
      "/tools/tree/manifests/generation-three/pixi.toml",
    ]);
  });

  it("uses the injected bootstrap and omits PIXI_HOME when absent", async () => {
    const commands: RuntimeCommand[] = [];
    const bootstraps: string[] = [];
    const runtime = new ConversionRuntime({
      pixi: "/missing/pixi",
      manifestDirectory: "/manifest",
      workerDirectory: "/workers",
      pixiHome: null,
      pixiCacheDirectory: null,
      lockedVersions,
      bootstrap: async (pixi) => void bootstraps.push(pixi),
      executableExists: async () => false,
      run: async (command) => {
        commands.push(command);
      },
    });

    const provisioning = runtime.provision(
      "core",
      "request-1",
      () => undefined,
    );
    runtime.acknowledgeProvisioning("request-1");
    await provisioning;

    expect(bootstraps).toEqual(["/missing/pixi"]);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.cwd).toBe("/manifest");
    expect(commands[0]?.env).toBeUndefined();
  });

  it("fails clearly when Pixi is missing and no bootstrap was supplied", async () => {
    const runtime = new ConversionRuntime({
      pixi: "/missing/pixi",
      manifestDirectory: "/relocated/manifest",
      workerDirectory: "/relocated/workers",
      pixiHome: null,
      pixiCacheDirectory: null,
      lockedVersions,
      executableExists: async () => false,
    });

    const provisioning = runtime.provision(
      "core",
      "request-1",
      () => undefined,
    );
    runtime.acknowledgeProvisioning("request-1");
    await expect(provisioning).rejects.toThrow(
      "Pixi is missing and this service host did not provide a bootstrap.",
    );
  });

  it("rejects malformed worker events instead of throwing from stdout", async () => {
    const runtime = new ConversionRuntime({
      pixi: "/tools/pixi",
      manifestDirectory: "/repo",
      workerDirectory: "/repo/conversion/worker",
      pixiHome: null,
      pixiCacheDirectory: null,
      lockedVersions,
      bootstrap: async () => undefined,
      run: async (command) => {
        if (command.args[0] === "run") command.onStdout?.("not-json\n");
      },
    });

    const execution = runtime.execute(request, () => undefined);
    runtime.acknowledgeProvisioning("request-1");
    await expect(execution).rejects.toThrow();
  });

  it("passes cooperative cancellation through provisioning and execution", async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const controller = new AbortController();
    const runtime = new ConversionRuntime({
      pixi: "/tools/pixi",
      manifestDirectory: "/repo",
      workerDirectory: "/repo/conversion/worker",
      pixiHome: null,
      pixiCacheDirectory: null,
      lockedVersions,
      bootstrap: async () => undefined,
      run: async (command) => {
        signals.push(command.signal);
      },
    });

    const execution = runtime.execute(
      request,
      () => undefined,
      controller.signal,
    );
    runtime.acknowledgeProvisioning("request-1");
    await execution;

    expect(signals).toEqual([controller.signal, controller.signal]);
  });

  it("passes cancellation to a missing-Pixi bootstrap", async () => {
    const controller = new AbortController();
    let bootstrapSignal: AbortSignal | undefined;
    const runtime = new ConversionRuntime({
      pixi: "/missing/pixi",
      manifestDirectory: "/repo",
      workerDirectory: "/repo/conversion/worker",
      pixiHome: null,
      pixiCacheDirectory: null,
      lockedVersions,
      executableExists: async () => false,
      bootstrap: async (_pixi, signal) => {
        bootstrapSignal = signal;
      },
      run: async () => undefined,
    });

    const execution = runtime.execute(
      request,
      () => undefined,
      controller.signal,
    );
    runtime.acknowledgeProvisioning("request-1");
    await execution;

    expect(bootstrapSignal).toBe(controller.signal);
  });

  it("cleans a partial environment when provisioning is cancelled and permits retry", async () => {
    const cleaned: string[] = [];
    let attempts = 0;
    const runtime = new ConversionRuntime({
      pixi: "/tools/pixi",
      manifestDirectory: "/manifest",
      workerDirectory: "/workers",
      pixiHome: "/tools/home",
      pixiCacheDirectory: "/tools/cache",
      lockedVersions,
      executableExists: async () => true,
      cleanupCapability: async (capability) => void cleaned.push(capability),
      run: async (command) => {
        if (command.args[0] !== "install") return;
        attempts += 1;
        if (attempts === 1) {
          if (command.signal?.aborted)
            throw new DOMException("Aborted", "AbortError");
          await new Promise<void>((_resolve, reject) =>
            command.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            ),
          );
        }
      },
    });
    const controller = new AbortController();
    const first = runtime.provision(
      "raster",
      "request-1",
      () => undefined,
      controller.signal,
    );
    runtime.acknowledgeProvisioning("request-1");
    controller.abort();
    await expect(first).rejects.toThrow(/abort/i);
    expect(cleaned).toEqual(["raster"]);

    const retry = runtime.provision("raster", "request-1", () => undefined);
    runtime.acknowledgeProvisioning("request-1");
    await retry;
    expect(attempts).toBe(2);
  });

  it("rechecks disk readiness after removal before bypassing disclosure", async () => {
    let installed = false;
    const commands: RuntimeCommand[] = [];
    const runtime = new ConversionRuntime({
      pixi: "/tools/pixi",
      manifestDirectory: "/manifest",
      workerDirectory: "/workers",
      pixiHome: "/tools/home",
      pixiCacheDirectory: "/tools/cache",
      lockedVersions,
      capabilityReady: async () => installed,
      executableExists: async () => true,
      run: async (command) => {
        commands.push(command);
        if (command.args[0] === "install") installed = true;
      },
    });
    const first = runtime.provision("raster", "request-1", () => undefined);
    runtime.acknowledgeProvisioning("request-1");
    await first;
    installed = false;
    const events: ConversionJobEvent[] = [];

    const afterRemoval = runtime.provision("raster", "request-2", (event) =>
      events.push(event),
    );
    await Promise.resolve();

    expect(events[0]).toMatchObject({ type: "provisioning-disclosure" });
    expect(
      commands.filter((command) => command.args[0] === "install"),
    ).toHaveLength(1);
    runtime.acknowledgeProvisioning("request-2");
    await afterRemoval;
    expect(
      commands.filter((command) => command.args[0] === "install"),
    ).toHaveLength(2);
  });
});
