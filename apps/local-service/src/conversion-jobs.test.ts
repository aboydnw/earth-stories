import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectStore } from "@earth-stories/project-store";
import type { ConversionRuntime } from "./conversion-runtime.js";
import { ConversionJobs } from "./conversion-jobs.js";

describe("ConversionJobs", () => {
  it("resolves project-owned paths and ignores caller output paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-stories-jobs-"));
    const store = new ProjectStore(root);
    await store.initialize();
    const project = await store.create({ title: "Conversions" });
    const assets = join(store.projectPath(project.id), "assets");
    await mkdir(assets, { recursive: true });
    await writeFile(join(assets, "places.geojson"), "{}");
    let received: unknown;
    const runtime = {
      execute: async (request: unknown) => {
        received = request;
      },
    } as unknown as ConversionRuntime;
    const jobs = new ConversionJobs(store, runtime);

    const job = await jobs.create(project.id, {
      operation: "prepare",
      capability: "vector",
      assetPath: "assets/places.geojson",
      options: { target: "pmtiles", outputPath: "/tmp/escape" },
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 0));

    expect(received).toMatchObject({
      input: { path: join(assets, "places.geojson") },
      options: { outputPath: join(assets, "prepared/places.pmtiles") },
    });
    expect(jobs.get(job.id)?.status).toBe("succeeded");
  });

  it("reports active work, refuses new jobs, and requests cancellation", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-stories-jobs-"));
    const store = new ProjectStore(root);
    await store.initialize();
    const project = await store.create({ title: "Conversions" });
    const assets = join(store.projectPath(project.id), "assets");
    await mkdir(assets, { recursive: true });
    await writeFile(join(assets, "places.geojson"), "{}");
    let release!: () => void;
    let cancellationRequested = false;
    const runtime = {
      execute: async (
        _request: unknown,
        _onEvent: unknown,
        signal?: AbortSignal,
      ) => {
        await new Promise<void>((resolve) => {
          release = resolve;
          signal?.addEventListener(
            "abort",
            () => {
              cancellationRequested = true;
            },
            { once: true },
          );
        });
      },
    } as unknown as ConversionRuntime;
    const jobs = new ConversionJobs(store, runtime);

    await jobs.create(project.id, {
      operation: "prepare",
      capability: "vector",
      assetPath: "assets/places.geojson",
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 0));
    expect(jobs.activity()).toBe(1);

    jobs.refuseNewJobs();
    jobs.cancelRunning();
    expect(cancellationRequested).toBe(true);
    await expect(
      jobs.create(project.id, {
        operation: "prepare",
        capability: "vector",
        assetPath: "assets/places.geojson",
      }),
    ).rejects.toThrow(/shutting down/i);

    release();
    await jobs.whenIdle();
    expect(jobs.activity()).toBe(0);
  });

  it("does not enqueue a request whose validation overlaps refusal", async () => {
    let finishRead!: () => void;
    const store = {
      read: async () => new Promise<void>((resolve) => (finishRead = resolve)),
    } as unknown as ProjectStore;
    const jobs = new ConversionJobs(store, {} as ConversionRuntime);

    const creating = jobs.create("story-1", {
      operation: "prepare",
      capability: "vector",
      assetPath: "assets/places.geojson",
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 0));
    jobs.refuseNewJobs();
    finishRead();

    await expect(creating).rejects.toThrow(/shutting down/i);
    expect(jobs.activity()).toBe(0);
  });

  it("does not enqueue a request whose file stat overlaps refusal", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-stories-jobs-"));
    const store = new ProjectStore(root);
    await store.initialize();
    const project = await store.create({ title: "Conversions" });
    const asset = join(store.projectPath(project.id), "assets/places.geojson");
    await mkdir(join(store.projectPath(project.id), "assets"), {
      recursive: true,
    });
    await writeFile(asset, "{}");
    let enterStat!: () => void;
    const statEntered = new Promise<void>((resolve) => (enterStat = resolve));
    let releaseStat!: () => void;
    const statReleased = new Promise<void>(
      (resolve) => (releaseStat = resolve),
    );
    const jobs = new ConversionJobs(store, {} as ConversionRuntime, {
      stat: async (path) => {
        if (path === asset) {
          enterStat();
          await statReleased;
        }
        return import("node:fs/promises").then((fileSystem) =>
          fileSystem.stat(path),
        );
      },
    });

    const creating = jobs.create(project.id, {
      operation: "prepare",
      capability: "vector",
      assetPath: "assets/places.geojson",
    });
    await Promise.race([
      statEntered,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("injected stat was not used")), 100),
      ),
    ]);
    jobs.refuseNewJobs();
    releaseStat();

    await expect(creating).rejects.toThrow(/shutting down/i);
    expect(jobs.activity()).toBe(0);
  });

  it("acknowledges, cancels, and retries provisioning on the existing job id", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-stories-jobs-"));
    const store = new ProjectStore(root);
    await store.initialize();
    const project = await store.create({ title: "Conversions" });
    const asset = join(store.projectPath(project.id), "assets/places.geojson");
    await mkdir(join(store.projectPath(project.id), "assets"), {
      recursive: true,
    });
    await writeFile(asset, "{}");
    let attempt = 0;
    let approve: (() => void) | undefined;
    const acknowledged: string[] = [];
    const runtime = {
      acknowledgeProvisioning: (requestId: string) => {
        acknowledged.push(requestId);
        approve?.();
        return Boolean(approve);
      },
      execute: async (
        request: { requestId: string; capability: "vector" },
        onEvent: (event: unknown) => void,
        signal?: AbortSignal,
      ) => {
        attempt += 1;
        onEvent({
          protocol: "earth-stories/conversion/v1",
          requestId: request.requestId,
          type: "provisioning-disclosure",
          capability: "vector",
          capabilityName: "Vector preparation",
          versions: ["GDAL >=3.10,<4"],
          estimatedBytes: 430_000_000,
          estimateKind: "estimated-installed-footprint",
          destination: "/tools/vector",
          credits: [{ name: "Pixi", license: "BSD-3-Clause" }],
        });
        await new Promise<void>((resolve, reject) => {
          approve = resolve;
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
        approve = undefined;
        if (attempt === 1) throw new Error("install failed");
      },
    } as unknown as ConversionRuntime;
    const jobs = new ConversionJobs(store, runtime);
    const created = await jobs.create(project.id, {
      operation: "prepare",
      capability: "vector",
      assetPath: "assets/places.geojson",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(jobs.get(created.id)?.status).toBe("awaiting-approval");
    expect(jobs.acknowledge(created.id)).toBe(true);
    await jobs.whenIdle();
    expect(jobs.get(created.id)?.status).toBe("failed");

    const retried = jobs.retry(created.id);
    expect(retried?.id).toBe(created.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(jobs.acknowledge(created.id)).toBe(true);
    await jobs.whenIdle();
    expect(jobs.get(created.id)?.status).toBe("succeeded");
    expect(acknowledged).toEqual([created.id, created.id]);
  });

  it("cancels an author-waiting provisioning job", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-stories-jobs-"));
    const store = new ProjectStore(root);
    await store.initialize();
    const project = await store.create({ title: "Conversions" });
    const asset = join(store.projectPath(project.id), "assets/places.geojson");
    await mkdir(join(store.projectPath(project.id), "assets"), {
      recursive: true,
    });
    await writeFile(asset, "{}");
    const runtime = {
      execute: async (
        request: { requestId: string },
        onEvent: (event: unknown) => void,
        signal?: AbortSignal,
      ) => {
        onEvent({
          protocol: "earth-stories/conversion/v1",
          requestId: request.requestId,
          type: "provisioning-disclosure",
          capability: "vector",
          capabilityName: "Vector preparation",
          versions: ["GDAL >=3.10,<4"],
          estimatedBytes: 430_000_000,
          estimateKind: "estimated-installed-footprint",
          destination: "/tools/vector",
          credits: [{ name: "Pixi", license: "BSD-3-Clause" }],
        });
        await new Promise<void>((_resolve, reject) =>
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          ),
        );
      },
    } as unknown as ConversionRuntime;
    const jobs = new ConversionJobs(store, runtime);
    const created = await jobs.create(project.id, {
      operation: "prepare",
      capability: "vector",
      assetPath: "assets/places.geojson",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(jobs.cancel(created.id)).toBe(true);
    await jobs.whenIdle();
    expect(jobs.get(created.id)?.status).toBe("cancelled");
  });
});
