import { platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LocalServiceConfig } from "./config.js";
import { runCommand, type Command } from "./command-runner.js";
import { FileCredentialStore } from "./credentials.js";
import { startLocalService, type RuntimeDependencies } from "./runtime.js";

type CommandExecutor = (command: Command) => Promise<unknown>;

function defaultRepositoryDirectory(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function resolveStandaloneConfig(
  environment: NodeJS.ProcessEnv = process.env,
  paths: { repositoryDirectory?: string; cwd?: string } = {},
): LocalServiceConfig {
  const repositoryDirectory =
    paths.repositoryDirectory ?? defaultRepositoryDirectory();
  const cwd = paths.cwd ?? process.cwd();
  return {
    host: "127.0.0.1",
    port: Number(environment.EARTH_STORIES_PORT ?? 4317),
    projectsDirectory: resolve(
      cwd,
      environment.EARTH_STORIES_PROJECTS_DIR ?? "./earth-stories-projects",
    ),
    viewerDirectory: resolve(
      cwd,
      environment.EARTH_STORIES_VIEWER_DIR ??
        join(repositoryDirectory, "dist/viewer"),
    ),
    editorDirectory: null,
    conversion: {
      pixiExecutable: resolve(
        cwd,
        environment.EARTH_STORIES_PIXI ??
          join(
            repositoryDirectory,
            platform() === "win32"
              ? ".earth-stories/bin/pixi.exe"
              : ".earth-stories/bin/pixi",
          ),
      ),
      manifestDirectory: repositoryDirectory,
      workerDirectory: join(repositoryDirectory, "conversion/worker"),
      pixiHome: null,
    },
    credentials: new FileCredentialStore(),
    capabilityToken: null,
  };
}

export function createStandaloneRuntimeDependencies(
  repositoryDirectory: string = defaultRepositoryDirectory(),
  execute: CommandExecutor = runCommand,
): RuntimeDependencies {
  return {
    bootstrapPixi: async (pixiExecutable, signal) => {
      await execute({
        executable: process.execPath,
        args: [
          join(repositoryDirectory, "scripts/install-pixi.mjs"),
          pixiExecutable,
        ],
        cwd: repositoryDirectory,
        signal,
      });
    },
  };
}

export async function runStandalone(): Promise<void> {
  try {
    const repositoryDirectory = defaultRepositoryDirectory();
    const service = await startLocalService(
      resolveStandaloneConfig(process.env, { repositoryDirectory }),
      createStandaloneRuntimeDependencies(repositoryDirectory),
    );
    process.stdout.write(
      `Earth Stories local service ready at ${service.origin}\nProjects: ${service.projectsDirectory}\n`,
    );
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      void service.close().then(
        () => process.exit(0),
        (cause) => {
          process.stderr.write(
            `${cause instanceof Error ? cause.message : String(cause)}\n`,
          );
          process.exit(1);
        },
      );
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (entrypoint) void runStandalone();

export * from "./config.js";
export * from "./credentials.js";
export * from "./runtime.js";
