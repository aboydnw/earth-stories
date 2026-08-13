import { randomBytes } from "node:crypto";
import {
  beginLocalService,
  FileCredentialStore,
  type CredentialStore,
  type LocalService,
  type LocalServiceConfig,
  type StartingLocalService,
} from "@earth-stories/local-service";
import type { DesktopPaths } from "./paths.js";
import type { DesktopToolRuntimeConfiguration } from "./tools.js";

type BeginLocalService = (config: LocalServiceConfig) => StartingLocalService;

export interface DesktopServiceDependencies {
  begin?: BeginLocalService;
  createCapabilityToken?: () => string;
  createCredentialStore?: (path: string) => CredentialStore;
  readinessTimeoutMs?: number;
  drainTimeoutMs?: number;
  tools?: DesktopToolRuntimeConfiguration;
  bootstrapPixi?: (executable: string, signal?: AbortSignal) => Promise<void>;
}

export class DesktopServiceReadinessError extends Error {
  readonly code = "readiness-timeout";

  constructor(timeoutMs: number) {
    super(
      `Earth Stories local service did not become ready within ${timeoutMs}ms.`,
    );
    this.name = "DesktopServiceReadinessError";
  }
}

export class DesktopServiceUnsavedStateError extends Error {
  readonly code = "unsaved-state-unresolved";

  constructor() {
    super("Save or discard editor changes before changing workspace.");
    this.name = "DesktopServiceUnsavedStateError";
  }
}

export function createCapabilityToken(): string {
  return randomBytes(32).toString("base64url");
}

export class DesktopService {
  readonly capabilityToken: string;
  #paths: DesktopPaths;
  readonly #begin: BeginLocalService;
  readonly #createCredentialStore: (path: string) => CredentialStore;
  readonly #readinessTimeoutMs: number;
  readonly #drainTimeoutMs: number;
  readonly #tools: DesktopToolRuntimeConfiguration | null;
  #running: LocalService | null = null;
  #starting: StartingLocalService | null = null;
  #shutdown: Promise<void> | null = null;

  constructor(
    paths: DesktopPaths,
    dependencies: DesktopServiceDependencies = {},
  ) {
    this.#paths = paths;
    this.#begin =
      dependencies.begin ??
      ((config) =>
        beginLocalService(config, {
          bootstrapPixi: dependencies.bootstrapPixi,
        }));
    this.capabilityToken = (
      dependencies.createCapabilityToken ?? createCapabilityToken
    )();
    this.#createCredentialStore =
      dependencies.createCredentialStore ??
      ((path) => new FileCredentialStore(path));
    this.#readinessTimeoutMs = dependencies.readinessTimeoutMs ?? 15_000;
    this.#drainTimeoutMs = dependencies.drainTimeoutMs ?? 30_000;
    this.#tools = dependencies.tools ?? null;
  }

  get origin(): string | null {
    return this.#running?.origin ?? null;
  }

  async start(): Promise<string> {
    if (this.#running) return this.#running.origin;
    if (this.#starting)
      throw new Error("Earth Stories local service is already starting.");

    const starting = this.#begin(this.#config());
    this.#starting = starting;
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(new DesktopServiceReadinessError(this.#readinessTimeoutMs)),
          this.#readinessTimeoutMs,
        );
        timer.unref?.();
      });
      const service = await Promise.race([starting.ready, timeout]);
      this.#running = service;
      return service.origin;
    } catch (cause) {
      await starting.close().catch(() => undefined);
      throw cause;
    } finally {
      if (timer) clearTimeout(timer);
      this.#starting = null;
    }
  }

  async restart(paths: DesktopPaths = this.#paths): Promise<string> {
    await this.#stopRunning();
    this.#paths = paths;
    return this.start();
  }

  async restartWithWorkspace(
    path: string,
    options: { unsavedStateResolved: boolean },
  ): Promise<string> {
    if (!options.unsavedStateResolved)
      throw new DesktopServiceUnsavedStateError();
    return this.restart({ ...this.#paths, projectsDirectory: path });
  }

  async resolveProjectDirectory(projectId: string): Promise<string> {
    if (!this.#running)
      throw new Error("Earth Stories local service is not running.");
    return this.#running.resolveProjectDirectory(projectId);
  }

  shutdown(): Promise<void> {
    if (this.#shutdown) return this.#shutdown;
    this.#shutdown = (async () => {
      const starting = this.#starting;
      if (starting) await starting.close();
      await this.#stopRunning();
    })();
    return this.#shutdown;
  }

  #config(): LocalServiceConfig {
    return {
      host: "127.0.0.1",
      port: 0,
      projectsDirectory: this.#paths.projectsDirectory,
      viewerDirectory: this.#paths.viewerDirectory,
      editorDirectory: this.#paths.editorDirectory,
      conversion: {
        pixiExecutable:
          this.#tools?.pixiExecutable ?? this.#paths.pixiExecutable,
        manifestDirectory:
          this.#tools?.manifestDirectory ??
          this.#paths.conversionManifestDirectory,
        workerDirectory:
          this.#tools?.workerDirectory ?? this.#paths.conversionWorkerDirectory,
        pixiHome: this.#tools?.pixiHome ?? this.#paths.pixiHome,
        pixiCacheDirectory: this.#tools?.pixiCacheDirectory ?? null,
        verifyManifest: this.#tools?.verifyManifest,
        cleanupCapability: this.#tools?.cleanupCapability,
        capabilityReady: this.#tools?.capabilityReady,
        acquireCapability: this.#tools?.acquireCapability,
      },
      credentials: this.#createCredentialStore(this.#paths.credentialsFile),
      capabilityToken: this.capabilityToken,
    };
  }

  async #stopRunning(): Promise<void> {
    const running = this.#running;
    if (!running) return;
    this.#running = null;
    try {
      const residual = await running.drain({ timeoutMs: this.#drainTimeoutMs });
      if (residual.runningConversions > 0)
        await running.forceTerminateConversions();
      if (residual.runningPublishes > 0)
        console.error(
          `Earth Stories closed with ${residual.runningPublishes} publication job(s) still settling.`,
        );
    } finally {
      await running.close();
    }
  }
}
