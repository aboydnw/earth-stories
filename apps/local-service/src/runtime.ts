import { type Server } from "node:http";
import type { Socket } from "node:net";
import { ProjectStore } from "@earth-stories/project-store";
import {
  resolveLocalServiceConfig,
  type LocalServiceConfig,
} from "./config.js";
import { ConversionJobs } from "./conversion-jobs.js";
import { ConversionRuntime } from "./conversion-runtime.js";
import { PagesJobs } from "./pages-jobs.js";
import { resolveToken } from "./github-auth.js";
import { createLocalServer, withProjectPublicationLock } from "./server.js";

export type LocalServiceStartupCode =
  | "address-in-use"
  | "access-denied"
  | "missing-viewer-directory"
  | "unwritable-projects-directory"
  | "startup-failed";

export class LocalServiceStartupError extends Error {
  readonly code: LocalServiceStartupCode;

  constructor(code: LocalServiceStartupCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "LocalServiceStartupError";
    this.code = code;
  }
}

export interface ServiceActivity {
  runningConversions: number;
  runningPublishes: number;
}

export interface LocalService {
  origin: string;
  port: number;
  projectsDirectory: string;
  resolveProjectDirectory(projectId: string): Promise<string>;
  activity(): ServiceActivity;
  drain(options?: { timeoutMs?: number }): Promise<ServiceActivity>;
  close(): Promise<void>;
}

export interface StartingLocalService {
  ready: Promise<LocalService>;
  close(): Promise<void>;
}

export interface RuntimeDependencies {
  bootstrapPixi?: (
    pixiExecutable: string,
    signal?: AbortSignal,
  ) => Promise<void>;
}

export interface DrainableJobRegistry {
  activity(): number;
  refuseNewJobs(): void;
  cancelRunning(): void;
  whenIdle(): Promise<void>;
}

export async function drainJobRegistries(
  conversionJobs: DrainableJobRegistry,
  pagesJobs: DrainableJobRegistry,
  options: { timeoutMs?: number } = {},
): Promise<ServiceActivity> {
  conversionJobs.refuseNewJobs();
  pagesJobs.refuseNewJobs();
  conversionJobs.cancelRunning();
  pagesJobs.cancelRunning();
  const timeoutMs = options.timeoutMs ?? 30_000;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.all([conversionJobs.whenIdle(), pagesJobs.whenIdle()]),
    new Promise<void>((resolveTimeout) => {
      timer = setTimeout(resolveTimeout, Math.max(0, timeoutMs));
      timer.unref?.();
    }),
  ]);
  if (timer) clearTimeout(timer);
  return {
    runningConversions: conversionJobs.activity(),
    runningPublishes: pagesJobs.activity(),
  };
}

export function toStartupError(
  cause: unknown,
  port: number,
): LocalServiceStartupError {
  if (cause instanceof LocalServiceStartupError) return cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? String(cause.code)
      : "";
  if (code === "EADDRINUSE")
    return new LocalServiceStartupError(
      "address-in-use",
      `Earth Stories could not start because port ${port} is already in use. Stop the other local service or set EARTH_STORIES_PORT to an available port.`,
      cause,
    );
  if (code === "EACCES")
    return new LocalServiceStartupError(
      "access-denied",
      `Earth Stories does not have permission to listen on port ${port}. Set EARTH_STORIES_PORT to an unprivileged port.`,
      cause,
    );
  if (/viewer directory (?:does not exist|is not a directory)/i.test(message))
    return new LocalServiceStartupError(
      "missing-viewer-directory",
      "The configured viewer directory does not exist.",
      cause,
    );
  if (/projects directory cannot be created/i.test(message))
    return new LocalServiceStartupError(
      "unwritable-projects-directory",
      "The configured projects directory cannot be created.",
      cause,
    );
  return new LocalServiceStartupError(
    "startup-failed",
    `Earth Stories local service could not start: ${message}`,
    cause,
  );
}

function listen(
  server: Server,
  port: number,
  signal: AbortSignal,
): Promise<number> {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (cause: Error) => {
      server.off("listening", onListening);
      rejectListen(cause);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectListen(new Error("The local service did not bind a TCP port."));
        return;
      }
      resolveListen(address.port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ port, host: "127.0.0.1", signal });
  });
}

function closedBeforeReady(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("The local service was closed before it was ready.");
}

export function beginLocalService(
  config: LocalServiceConfig,
  dependencies: RuntimeDependencies = {},
): StartingLocalService {
  const startup = new AbortController();
  const sockets = new Set<Socket>();
  let server: Server | null = null;
  let closePromise: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    startup.abort(
      new Error("The local service was closed before it was ready."),
    );
    closePromise = new Promise<void>((resolveClose, rejectClose) => {
      for (const socket of sockets) socket.destroy();
      if (!server?.listening) {
        resolveClose();
        return;
      }
      server.close((cause) => {
        if (
          cause &&
          (cause as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
        )
          rejectClose(cause);
        else resolveClose();
      });
    });
    return closePromise;
  };

  const ready = (async (): Promise<LocalService> => {
    let resolved;
    try {
      resolved = await resolveLocalServiceConfig(config);
    } catch (cause) {
      if (startup.signal.aborted) throw closedBeforeReady(startup.signal);
      throw toStartupError(cause, config.port);
    }
    if (startup.signal.aborted) throw closedBeforeReady(startup.signal);

    const store = new ProjectStore(resolved.projectsDirectory);
    const conversionJobs = new ConversionJobs(
      store,
      new ConversionRuntime({
        pixi: resolved.conversion.pixiExecutable,
        manifestDirectory: resolved.conversion.manifestDirectory,
        workerDirectory: resolved.conversion.workerDirectory,
        pixiHome: resolved.conversion.pixiHome,
        bootstrap: dependencies.bootstrapPixi,
      }),
    );
    const pagesJobs = new PagesJobs(store, {
      viewerDirectory: resolved.viewerDirectory,
      withLock: withProjectPublicationLock,
      resolveToken: (options) =>
        resolveToken({ ...options, store: resolved.credentials }),
    });
    await store.initialize();
    if (startup.signal.aborted) throw closedBeforeReady(startup.signal);
    server = createLocalServer(store, resolved, {
      conversion: conversionJobs,
      pages: pagesJobs,
    });
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });

    let port: number;
    try {
      port = await listen(server, resolved.port, startup.signal);
    } catch (cause) {
      for (const socket of sockets) socket.destroy();
      if (startup.signal.aborted) throw closedBeforeReady(startup.signal);
      throw toStartupError(cause, resolved.port);
    }
    if (startup.signal.aborted) {
      await close();
      throw closedBeforeReady(startup.signal);
    }

    const activity = (): ServiceActivity => ({
      runningConversions: conversionJobs.activity(),
      runningPublishes: pagesJobs.activity(),
    });

    return {
      origin: `http://127.0.0.1:${port}`,
      port,
      projectsDirectory: store.root,
      resolveProjectDirectory: async (projectId) => {
        await store.read(projectId);
        return store.projectPath(projectId);
      },
      activity,
      drain: (options) =>
        drainJobRegistries(conversionJobs, pagesJobs, options),
      close,
    };
  })();

  return { ready, close };
}

export function startLocalService(
  config: LocalServiceConfig,
  dependencies: RuntimeDependencies = {},
): Promise<LocalService> {
  return beginLocalService(config, dependencies).ready;
}
