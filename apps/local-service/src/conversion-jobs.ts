import { stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import {
  CONVERSION_PROTOCOL_VERSION,
  conversionCapabilitySchema,
  conversionOperationSchema,
  type ConversionJobEvent,
} from "@earth-stories/story-schema";
import type { ProjectStore } from "@earth-stories/project-store";
import { ConversionRuntime } from "./conversion-runtime.js";

export type ConversionJobStatus =
  | "queued"
  | "awaiting-approval"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface ConversionJobSnapshot {
  id: string;
  projectId: string;
  status: ConversionJobStatus;
  events: ConversionJobEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversionJobsDependencies {
  stat(path: string): Promise<Stats>;
}

const outputExtension = (capability: string, target?: unknown): string => {
  if (capability === "raster") return ".cog.tif";
  if (capability === "multidim") return ".cog.tif";
  if (capability === "pointcloud") return ".copc.laz";
  if (capability === "vector" && target === "trajectory") return ".trips.json";
  if (capability === "vector" && target === "pmtiles") return ".pmtiles";
  return ".parquet";
};

export class ConversionJobs {
  readonly #jobs = new Map<string, ConversionJobSnapshot>();
  readonly #controllers = new Map<string, AbortController>();
  readonly #requests = new Map<string, Record<string, unknown>>();
  readonly #idleWaiters = new Set<() => void>();
  readonly #runtime: ConversionRuntime;
  readonly #store: ProjectStore;
  readonly #stat: (path: string) => Promise<Stats>;
  #accepting = true;

  constructor(
    store: ProjectStore,
    runtime: ConversionRuntime,
    dependencies: Partial<ConversionJobsDependencies> = {},
  ) {
    this.#store = store;
    this.#runtime = runtime;
    this.#stat = dependencies.stat ?? stat;
  }

  get(id: string): ConversionJobSnapshot | null {
    return this.#jobs.get(id) ?? null;
  }

  acknowledge(id: string): boolean {
    const snapshot = this.#jobs.get(id);
    if (!snapshot || snapshot.status !== "awaiting-approval") return false;
    const accepted = this.#runtime.acknowledgeProvisioning(id);
    if (accepted) {
      snapshot.status = "running";
      snapshot.updatedAt = new Date().toISOString();
    }
    return accepted;
  }

  cancel(id: string): boolean {
    const controller = this.#controllers.get(id);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  retry(id: string): ConversionJobSnapshot | null {
    const snapshot = this.#jobs.get(id);
    const request = this.#requests.get(id);
    if (
      !this.#accepting ||
      !snapshot ||
      !request ||
      (snapshot.status !== "failed" && snapshot.status !== "cancelled") ||
      this.#controllers.has(id)
    )
      return null;
    snapshot.status = "queued";
    snapshot.updatedAt = new Date().toISOString();
    const controller = new AbortController();
    this.#controllers.set(id, controller);
    void this.#run(snapshot, request, controller);
    return snapshot;
  }

  activity(): number {
    return this.#controllers.size;
  }

  refuseNewJobs(): void {
    this.#accepting = false;
  }

  cancelRunning(): void {
    for (const controller of this.#controllers.values()) controller.abort();
  }

  async forceTerminate(): Promise<void> {
    await this.#runtime.forceTerminate();
    await this.whenIdle();
  }

  whenIdle(): Promise<void> {
    if (this.#controllers.size === 0) return Promise.resolve();
    return new Promise((resolveIdle) => this.#idleWaiters.add(resolveIdle));
  }

  async create(
    projectId: string,
    input: {
      operation?: unknown;
      capability?: unknown;
      assetPath?: unknown;
      options?: unknown;
    },
  ): Promise<ConversionJobSnapshot> {
    if (!this.#accepting)
      throw new Error(
        "The local service is shutting down and cannot start new jobs.",
      );
    await this.#store.read(projectId);
    if (!this.#accepting)
      throw new Error(
        "The local service is shutting down and cannot start new jobs.",
      );
    const operation = conversionOperationSchema.parse(input.operation);
    const capability = conversionCapabilitySchema.parse(input.capability);
    if (typeof input.assetPath !== "string" || !input.assetPath)
      throw new Error("Choose a project asset to convert");
    const absoluteInput = this.#store.assetPath(projectId, input.assetPath);
    const inputInfo = await this.#stat(absoluteInput);
    if (!this.#accepting)
      throw new Error(
        "The local service is shutting down and cannot start new jobs.",
      );
    if (!inputInfo.isFile()) throw new Error("Conversion input is not a file");
    const options =
      input.options && typeof input.options === "object"
        ? { ...(input.options as Record<string, unknown>) }
        : {};
    if (operation === "prepare") {
      const stem = basename(input.assetPath, extname(input.assetPath));
      const filename = `${stem}${outputExtension(capability, options.target)}`;
      options.outputPath = this.#store.assetPath(
        projectId,
        `assets/prepared/${filename}`,
      );
      options.runtimeDirectory = this.#store.assetPath(
        projectId,
        ".earth-stories/conversion-runtime",
      );
    } else {
      delete options.outputPath;
      delete options.runtimeDirectory;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const snapshot: ConversionJobSnapshot = {
      id,
      projectId,
      status: "queued",
      events: [],
      createdAt: now,
      updatedAt: now,
    };
    this.#jobs.set(id, snapshot);
    const controller = new AbortController();
    this.#controllers.set(id, controller);
    const request = {
      protocol: CONVERSION_PROTOCOL_VERSION,
      requestId: id,
      projectId,
      operation,
      capability,
      input: {
        path: resolve(absoluteInput),
        filename: basename(input.assetPath),
        sizeBytes: inputInfo.size,
        mediaType: null,
      },
      options,
    };
    this.#requests.set(id, request);
    void this.#run(snapshot, request, controller);
    return snapshot;
  }

  async #run(
    snapshot: ConversionJobSnapshot,
    request: Record<string, unknown>,
    controller: AbortController,
  ): Promise<void> {
    snapshot.status = "running";
    snapshot.updatedAt = new Date().toISOString();
    try {
      await this.#runtime.execute(
        request,
        (event) => {
          const publicEvent =
            event.type === "result" && typeof event.output.path === "string"
              ? {
                  ...event,
                  output: {
                    ...event.output,
                    path: relative(
                      this.#store.projectPath(snapshot.projectId),
                      event.output.path,
                    ).replaceAll("\\", "/"),
                  },
                }
              : event;
          snapshot.events.push(publicEvent);
          snapshot.updatedAt = new Date().toISOString();
          if (event.type === "provisioning-disclosure")
            snapshot.status = "awaiting-approval";
          if (event.type === "progress") snapshot.status = "running";
          if (event.type === "result") snapshot.status = "succeeded";
          if (event.type === "failure")
            snapshot.status =
              event.status === "cancelled" ? "cancelled" : "failed";
        },
        controller.signal,
      );
      if (snapshot.status === "running") snapshot.status = "succeeded";
    } catch (cause) {
      const cancelled = controller.signal.aborted;
      snapshot.status = cancelled ? "cancelled" : "failed";
      snapshot.events.push({
        protocol: CONVERSION_PROTOCOL_VERSION,
        requestId: snapshot.id,
        type: "failure",
        status: cancelled ? "cancelled" : "failed",
        code: cancelled ? "provisioning-cancelled" : "runtime-error",
        message: cancelled
          ? "Tool installation was cancelled. You can retry this conversion."
          : cause instanceof Error
            ? cause.message
            : "Conversion runtime failed",
        retryable: true,
        details: {},
      });
    } finally {
      snapshot.updatedAt = new Date().toISOString();
      this.#controllers.delete(snapshot.id);
      if (this.#controllers.size === 0) {
        for (const resolveIdle of this.#idleWaiters) resolveIdle();
        this.#idleWaiters.clear();
      }
    }
  }
}
