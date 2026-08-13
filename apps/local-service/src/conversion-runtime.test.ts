import { describe, expect, it } from "vitest";
import type { ConversionJobEvent } from "@earth-stories/story-schema";
import {
  CAPABILITY_INSTALL_ESTIMATES,
  ConversionRuntime,
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

  it("uses the injected bootstrap and omits PIXI_HOME when absent", async () => {
    const commands: RuntimeCommand[] = [];
    const bootstraps: string[] = [];
    const runtime = new ConversionRuntime({
      pixi: "/missing/pixi",
      manifestDirectory: "/manifest",
      workerDirectory: "/workers",
      pixiHome: null,
      pixiCacheDirectory: null,
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
});
