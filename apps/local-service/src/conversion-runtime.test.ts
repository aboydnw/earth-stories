import { describe, expect, it } from "vitest";
import type { ConversionJobEvent } from "@earth-stories/story-schema";
import {
  CAPABILITY_DOWNLOAD_ESTIMATES,
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

    await runtime.execute(request, (event) => events.push(event));
    await runtime.execute(request, (event) => events.push(event));

    expect(
      commands.filter((command) => command.args[0] === "install"),
    ).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "progress",
      stage: "provisioning",
      total: CAPABILITY_DOWNLOAD_ESTIMATES.vector,
    });
    expect(events.filter((event) => event.type === "result")).toHaveLength(2);
    expect(commands[0]).toMatchObject({
      cwd: "/writable/manifest",
      env: { PIXI_HOME: "/workspace/pixi-home" },
      args: [
        "install",
        "--manifest-path",
        "/writable/manifest/pixi.toml",
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
      bootstrap: async (pixi) => void bootstraps.push(pixi),
      executableExists: async () => false,
      run: async (command) => {
        commands.push(command);
      },
    });

    await runtime.provision("core", "request-1", () => undefined);

    expect(bootstraps).toEqual(["/missing/pixi"]);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.cwd).toBe("/manifest");
    expect(commands[0]?.env).toBeUndefined();
  });

  it("rejects malformed worker events instead of throwing from stdout", async () => {
    const runtime = new ConversionRuntime({
      pixi: "/tools/pixi",
      manifestDirectory: "/repo",
      workerDirectory: "/repo/conversion/worker",
      pixiHome: null,
      bootstrap: async () => undefined,
      run: async (command) => {
        if (command.args[0] === "run") command.onStdout?.("not-json\n");
      },
    });

    await expect(runtime.execute(request, () => undefined)).rejects.toThrow();
  });
});
