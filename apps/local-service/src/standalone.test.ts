import { platform } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createStandaloneRuntimeDependencies,
  resolveStandaloneConfig,
} from "./standalone.js";

describe("resolveStandaloneConfig", () => {
  it("imports without starting the service and preserves every legacy default", () => {
    const repositoryDirectory = "/opt/earth-stories";
    const cwd = "/work";
    const config = resolveStandaloneConfig({}, { repositoryDirectory, cwd });
    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 4317,
      projectsDirectory: resolve(cwd, "earth-stories-projects"),
      viewerDirectory: resolve(repositoryDirectory, "dist/viewer"),
      editorDirectory: null,
      conversion: {
        pixiExecutable: resolve(
          repositoryDirectory,
          platform() === "win32"
            ? ".earth-stories/bin/pixi.exe"
            : ".earth-stories/bin/pixi",
        ),
        manifestDirectory: repositoryDirectory,
        workerDirectory: resolve(repositoryDirectory, "conversion/worker"),
        pixiHome: null,
      },
      capabilityToken: null,
    });
  });

  it("resolves all legacy environment overrides", () => {
    const config = resolveStandaloneConfig(
      {
        EARTH_STORIES_PORT: "9000",
        EARTH_STORIES_PROJECTS_DIR: "relative-projects",
        EARTH_STORIES_VIEWER_DIR: "relative-viewer",
        EARTH_STORIES_PIXI: "relative-pixi",
      },
      { repositoryDirectory: "/repo", cwd: "/cwd" },
    );
    expect(config.port).toBe(9000);
    expect(config.projectsDirectory).toBe("/cwd/relative-projects");
    expect(config.viewerDirectory).toBe("/cwd/relative-viewer");
    expect(config.conversion.pixiExecutable).toBe("/cwd/relative-pixi");
  });
});

describe("createStandaloneRuntimeDependencies", () => {
  it("adapts the known repository Pixi installer for the standalone host", async () => {
    const commands: unknown[] = [];
    const dependencies = createStandaloneRuntimeDependencies(
      "/opt/earth-stories",
      async (command) => void commands.push(command),
    );
    const signal = new AbortController().signal;

    await dependencies.bootstrapPixi?.("/tools/pixi", signal);

    expect(commands).toEqual([
      {
        executable: process.execPath,
        args: [
          resolve("/opt/earth-stories", "scripts/install-pixi.mjs"),
          "/tools/pixi",
        ],
        cwd: "/opt/earth-stories",
        signal,
      },
    ]);
  });
});
