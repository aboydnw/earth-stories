import { platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CredentialStore, LocalServiceConfig } from "./config.js";
import { startLocalService } from "./runtime.js";

const unusedCredentials: CredentialStore = {
  read: async () => null,
  write: async () => undefined,
  clear: async () => undefined,
};

export function resolveStandaloneConfig(
  environment: NodeJS.ProcessEnv = process.env,
  paths: { repositoryDirectory?: string; cwd?: string } = {},
): LocalServiceConfig {
  const repositoryDirectory =
    paths.repositoryDirectory ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
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
    credentials: unusedCredentials,
    capabilityToken: null,
  };
}

export async function runStandalone(): Promise<void> {
  try {
    const service = await startLocalService(resolveStandaloneConfig());
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
