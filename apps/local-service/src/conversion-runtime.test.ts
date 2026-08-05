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
      repositoryRoot: "/repo",
      ensureExecutable: async () => undefined,
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
  });
});
