import { describe, expect, it, vi } from "vitest";
import type { ProjectStore } from "@earth-stories/project-store";
import { PagesJobs, type PagesJobsDependencies } from "./pages-jobs.js";

const store = {
  read: vi.fn(async () => ({
    id: "story-1",
    metadata: { title: "Field Notes: A Coastline" },
  })),
  projectPath: (id: string) => `/projects/${id}`,
} as unknown as ProjectStore;

function dependencies(
  overrides: Partial<PagesJobsDependencies> = {},
): Partial<PagesJobsDependencies> {
  return {
    resolveToken: vi.fn(async () => ({
      token: "ghp_secret",
      login: "mapper",
      source: "gh" as const,
    })),
    preflight: vi.fn(async () => ({
      ready: true,
      estimatedIncludedBytes: 20_000_000,
      profile: "connected" as const,
    })) as unknown as PagesJobsDependencies["preflight"],
    build: vi.fn(async () => ({
      directory: "/projects/story-1/publication",
      manifest: { build: { id: "build-7" } },
    })) as unknown as PagesJobsDependencies["build"],
    inspectRelease: vi.fn(async () => ({
      totalBytes: 20_000_000,
      largestFile: { path: "index.html", bytes: 1_000 },
    })),
    ensureRepository: vi.fn(async () => ({ created: true })),
    pushRelease: vi.fn(async () => ({ branch: "gh-pages" })),
    enablePages: vi.fn(async () => undefined),
    waitForPages: vi.fn(async () => true),
    checkShareLink: vi.fn(async () => ({
      problems: [],
    })) as unknown as PagesJobsDependencies["checkShareLink"],
    readPublishRecord: vi.fn(async () => null),
    writePublishRecord: vi.fn(async () => undefined),
    ...overrides,
  };
}

async function settle(jobs: PagesJobs, id: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const snapshot = jobs.get(id);
    if (
      snapshot &&
      snapshot.status !== "queued" &&
      snapshot.status !== "running"
    )
      return snapshot;
    await new Promise((done) => setTimeout(done, 5));
  }
  throw new Error("Publish job never settled");
}

describe("PagesJobs", () => {
  it("publishes, records the location, and reports the URL", async () => {
    const deps = dependencies();
    const jobs = new PagesJobs(store, deps);
    const started = await jobs.create("story-1");
    expect(started.id).toBeTruthy();
    expect(["queued", "running"]).toContain(started.status);

    const finished = await settle(jobs, started.id);
    expect(finished.status).toBe("succeeded");
    expect(finished.url).toBe(
      "https://mapper.github.io/field-notes-a-coastline/",
    );
    expect(finished.record).toMatchObject({
      owner: "mapper",
      repo: "field-notes-a-coastline",
      branch: "gh-pages",
      buildId: "build-7",
    });
    expect(finished.stage).toBe("done");
    expect(deps.writePublishRecord).toHaveBeenCalled();
  });

  it("builds with the final URL so metadata is correct on the first push", async () => {
    const deps = dependencies();
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1", { repo: "coastline" });
    await settle(jobs, id);
    expect(deps.build).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationUrl: "https://mapper.github.io/coastline/",
      }),
    );
  });

  it("stops before building when the story cannot fit on Pages", async () => {
    const deps = dependencies({
      preflight: vi.fn(async () => ({
        ready: true,
        estimatedIncludedBytes: 1_500_000_000,
        profile: "portable" as const,
      })) as unknown as PagesJobsDependencies["preflight"],
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    const finished = await settle(jobs, id);
    expect(finished.status).toBe("failed");
    expect(finished.error).toMatch(/1 GB/);
    expect(deps.build).not.toHaveBeenCalled();
  });

  it("refuses to publish a story with blocking problems", async () => {
    const deps = dependencies({
      preflight: vi.fn(async () => ({
        ready: false,
        estimatedIncludedBytes: 1_000,
        profile: "connected" as const,
      })) as unknown as PagesJobsDependencies["preflight"],
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    const finished = await settle(jobs, id);
    expect(finished.status).toBe("failed");
    expect(deps.pushRelease).not.toHaveBeenCalled();
  });

  it("surfaces the device code while waiting for sign-in", async () => {
    const deps = dependencies({
      resolveToken: vi.fn(async (options) => {
        options?.onDeviceCode?.({
          verificationUri: "https://github.com/login/device",
          userCode: "WXYZ-1234",
          expiresInSeconds: 900,
        });
        return { token: "t", login: "mapper", source: "device" as const };
      }) as unknown as PagesJobsDependencies["resolveToken"],
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    const finished = await settle(jobs, id);
    expect(
      finished.events.some(({ message }) => message.includes("WXYZ-1234")),
    ).toBe(true);
    expect(finished.deviceCode).toBeNull();
  });

  it("reports a mid-stage failure without losing earlier progress", async () => {
    const deps = dependencies({
      pushRelease: vi.fn(async () => {
        throw new Error("git push failed: remote rejected");
      }),
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    const finished = await settle(jobs, id);
    expect(finished.status).toBe("failed");
    expect(finished.error).toMatch(/remote rejected/);
    expect(finished.stage).toBe("uploading");
    expect(deps.enablePages).not.toHaveBeenCalled();
    expect(deps.writePublishRecord).not.toHaveBeenCalled();
  });

  it("adds upload progress events while blobs are transferred", async () => {
    const deps = dependencies({
      pushRelease: vi.fn(async (options) => {
        options.onProgress?.({ uploaded: 0, skipped: 2 });
        options.onProgress?.({ uploaded: 1, skipped: 2 });
        return { branch: "gh-pages" };
      }),
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    const finished = await settle(jobs, id);
    const uploadEvents = finished.events.filter(
      ({ stage }) => stage === "uploading",
    );
    expect(uploadEvents.map(({ message }) => message)).toEqual([
      "Uploading the release…",
      "Uploaded 0 files; skipped 2 unchanged files.",
      "Uploaded 1 file; skipped 2 unchanged files.",
    ]);
  });

  it("ignores uploader progress callbacks after the upload has failed", async () => {
    let reportProgress:
      ((progress: { uploaded: number; skipped: number }) => void) | undefined;
    const deps = dependencies({
      pushRelease: vi.fn(async (options) => {
        reportProgress = options.onProgress;
        options.onProgress?.({ uploaded: 1, skipped: 0 });
        throw new Error("blob upload failed");
      }),
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    const finished = await settle(jobs, id);
    const eventCount = finished.events.length;

    reportProgress?.({ uploaded: 2, skipped: 0 });

    expect(finished.status).toBe("failed");
    expect(finished.events).toHaveLength(eventCount);
    expect(finished.events.at(-1)?.message).toBe("blob upload failed");
  });

  it("keeps the existing repository and URL when republishing", async () => {
    const deps = dependencies({
      readPublishRecord: vi.fn(async () => ({
        owner: "mapper",
        repo: "already-published",
        url: "https://mapper.github.io/already-published/",
        branch: "gh-pages",
        buildId: "build-1",
        publishedAt: "2026-08-01T00:00:00.000Z",
      })),
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    const finished = await settle(jobs, id);
    expect(finished.url).toBe("https://mapper.github.io/already-published/");
    expect(deps.ensureRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: "already-published",
        expectExisting: true,
      }),
    );
  });

  it("still succeeds when Pages has not finished building yet", async () => {
    const deps = dependencies({ waitForPages: vi.fn(async () => false) });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    const finished = await settle(jobs, id);
    expect(finished.status).toBe("succeeded");
    expect(deps.checkShareLink).not.toHaveBeenCalled();
    expect(finished.events.some(({ severity }) => severity === "warning")).toBe(
      true,
    );
  });

  it("signs in before taking the project lock", async () => {
    const order: string[] = [];
    const deps = dependencies({
      resolveToken: vi.fn(async () => {
        order.push("sign-in");
        return { token: "t", login: "mapper", source: "device" as const };
      }) as unknown as PagesJobsDependencies["resolveToken"],
      withLock: async (_id, operation) => {
        order.push("lock");
        return operation();
      },
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    await settle(jobs, id);
    expect(order).toEqual(["sign-in", "lock"]);
  });

  it("never puts the token in a job event", async () => {
    const deps = dependencies({
      pushRelease: vi.fn(async () => {
        throw new Error("upload failed with ghp_secret");
      }),
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    const finished = await settle(jobs, id);
    expect(finished.error).not.toContain("ghp_secret");
    for (const event of finished.events)
      expect(event.message).not.toContain("ghp_secret");
  });
});
