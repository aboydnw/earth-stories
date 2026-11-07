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

  it("replaces upload progress instead of growing the event list per file", async () => {
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

  it("reports active work, refuses new jobs, and requests cancellation", async () => {
    let finishSignIn!: () => void;
    let cancellationRequested = false;
    const deps = dependencies({
      resolveToken: vi.fn(async (options) => {
        await new Promise<void>((resolve) => {
          finishSignIn = resolve;
          options?.signal?.addEventListener(
            "abort",
            () => {
              cancellationRequested = true;
            },
            { once: true },
          );
        });
        return { token: "t", login: "mapper", source: "device" as const };
      }),
    });
    const jobs = new PagesJobs(store, deps);

    await jobs.create("story-1");
    await new Promise((resolveWait) => setTimeout(resolveWait, 0));
    expect(jobs.activity()).toBe(1);

    jobs.refuseNewJobs();
    jobs.cancelRunning();
    expect(cancellationRequested).toBe(true);
    await expect(jobs.create("story-1")).rejects.toThrow(/shutting down/i);

    finishSignIn();
    await jobs.whenIdle();
    expect(jobs.activity()).toBe(0);
  });

  it("passes cancellation to Pages polling and stops before repository preparation", async () => {
    let finishInspection!: () => void;
    const inspectRelease = vi.fn(
      () =>
        new Promise<{
          totalBytes: number;
          largestFile: { path: string; bytes: number };
        }>((resolve) => {
          finishInspection = () =>
            resolve({
              totalBytes: 20_000_000,
              largestFile: { path: "index.html", bytes: 1_000 },
            });
        }),
    );
    const waitForPages = vi.fn(async () => true);
    const deps = dependencies({ inspectRelease, waitForPages });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    while (!inspectRelease.mock.calls.length)
      await new Promise((resolve) => setTimeout(resolve, 0));

    jobs.cancelRunning();
    finishInspection();
    await jobs.whenIdle();

    expect(jobs.get(id)?.status).toBe("failed");
    expect(deps.ensureRepository).not.toHaveBeenCalled();
    expect(waitForPages).not.toHaveBeenCalled();
  });

  it("passes the job signal through upload and Pages polling", async () => {
    const waitForPages = vi.fn(async () => true);
    const deps = dependencies({ waitForPages });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    await settle(jobs, id);

    expect(deps.pushRelease).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(waitForPages).toHaveBeenCalledWith(
      "https://mapper.github.io/field-notes-a-coastline/",
      { signal: expect.any(AbortSignal) },
    );
  });
});

describe("selected GitHub App repositories", () => {
  const authorized = () => ({
    identity: { token: "app-secret", login: "mapper", source: "gh" as const },
    repository: {
      id: 42,
      installationId: 7,
      owner: "map-org",
      name: "coast",
      fullName: "map-org/coast",
    },
  });

  const reviewed = () => ({
    login: "mapper",
    id: 42,
    installationId: 7,
    owner: "map-org",
    name: "coast",
  });

  it.each([undefined, null, "42", 0, -1, 1.5])(
    "requires a selected numeric ID (%s) before build",
    async (repositoryId) => {
      const deps = dependencies({
        authorizeRepository: vi.fn(async () => authorized()),
      });
      const jobs = new PagesJobs(store, deps);
      const { id } = await jobs.create("story-1", { repositoryId });
      expect((await settle(jobs, id)).error).toMatch(
        /Choose a GitHub repository/,
      );
      expect(deps.authorizeRepository).not.toHaveBeenCalled();
      expect(deps.build).not.toHaveBeenCalled();
      expect(deps.resolveToken).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    null,
    [],
    {},
    "map-org/coast",
    { ...reviewed(), id: 99 },
    { ...reviewed(), login: undefined },
    { ...reviewed(), login: 7 },
    { ...reviewed(), login: "" },
    { ...reviewed(), installationId: "7" },
    { ...reviewed(), installationId: 0 },
    { ...reviewed(), owner: "map-org/other" },
    { ...reviewed(), name: "../other" },
    { ...reviewed(), fullName: "map-org/coast" },
  ])(
    "requires a valid reviewed destination (%j)",
    async (reviewedRepository) => {
      const deps = dependencies({
        authorizeRepository: vi.fn(async () => authorized()),
      });
      const jobs = new PagesJobs(store, deps);
      const { id } = await jobs.create("story-1", {
        repositoryId: 42,
        reviewedRepository,
      });
      expect((await settle(jobs, id)).status).toBe("failed");
      expect(deps.authorizeRepository).not.toHaveBeenCalled();
      expect(deps.build).not.toHaveBeenCalled();
      expect(deps.ensureRepository).not.toHaveBeenCalled();
    },
  );

  it.each(["owner", "name", "installationId", "id", "login"])(
    "refuses a %s change before first authorization",
    async (field) => {
      const deps = dependencies({
        authorizeRepository: vi.fn(async () => {
          const value = authorized();
          if (field === "login") value.identity.login = "another-user";
          if (field === "owner") value.repository.owner = "new-org";
          if (field === "name") value.repository.name = "new-name";
          if (field === "installationId") value.repository.installationId = 8;
          if (field === "id") value.repository.id = 99;
          return value;
        }),
      });
      const jobs = new PagesJobs(store, deps);
      const { id } = await jobs.create("story-1", {
        repositoryId: 42,
        reviewedRepository: reviewed(),
      });
      expect((await settle(jobs, id)).error).toMatch(
        /changed since you reviewed/,
      );
      expect(deps.build).not.toHaveBeenCalled();
      expect(deps.ensureRepository).not.toHaveBeenCalled();
      expect(deps.pushRelease).not.toHaveBeenCalled();
      expect(deps.enablePages).not.toHaveBeenCalled();
    },
  );

  it("uses the authorized organization repository and never a browser name", async () => {
    const deps = dependencies({
      authorizeRepository: vi.fn(async () => authorized()),
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1", {
      repositoryId: 42,
      reviewedRepository: reviewed(),
      repo: "untrusted",
    });
    const result = await settle(jobs, id);
    expect(result.status).toBe("succeeded");
    expect(result.url).toBe("https://map-org.github.io/coast/");
    expect(deps.resolveToken).not.toHaveBeenCalled();
    expect(deps.build).toHaveBeenCalledWith(
      expect.objectContaining({ publicationUrl: result.url }),
    );
    expect(deps.ensureRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "map-org",
        repo: "coast",
        allowCreate: false,
        expectExisting: false,
      }),
    );
    expect(deps.authorizeRepository).toHaveBeenCalledWith(
      42,
      expect.any(AbortSignal),
    );
  });

  it.each(["revoked", "account", "token", "owner", "name", "installation"])(
    "stops before writes after %s changes",
    async (change) => {
      let checks = 0;
      const deps = dependencies({
        authorizeRepository: vi.fn(async () => {
          const value = authorized();
          if (++checks === 1) return value;
          if (change === "revoked")
            throw new Error("Repository access was revoked.");
          if (change === "account") value.identity.login = "other";
          if (change === "token") value.identity.token = "new-secret";
          if (change === "owner") value.repository.owner = "other-org";
          if (change === "name") value.repository.name = "other-repo";
          if (change === "installation") value.repository.installationId = 8;
          return value;
        }),
      });
      const jobs = new PagesJobs(store, deps);
      const { id } = await jobs.create("story-1", {
        repositoryId: 42,
        reviewedRepository: reviewed(),
      });
      expect((await settle(jobs, id)).status).toBe("failed");
      expect(deps.build).toHaveBeenCalled();
      expect(deps.ensureRepository).not.toHaveBeenCalled();
      expect(deps.pushRelease).not.toHaveBeenCalled();
    },
  );

  it.each(["main", "gh-pages"])(
    "never trusts a recorded %s branch for a different destination",
    async (branch) => {
      const deps = dependencies({
        authorizeRepository: vi.fn(async () => authorized()),
        readPublishRecord: vi.fn(async () => ({
          owner: "other-org",
          repo: "coast",
          branch,
          url: "https://other-org.github.io/coast/",
          buildId: "old",
          publishedAt: "2026-08-01T00:00:00.000Z",
        })),
      });
      const jobs = new PagesJobs(store, deps);
      const { id } = await jobs.create("story-1", {
        repositoryId: 42,
        reviewedRepository: reviewed(),
      });
      await settle(jobs, id);
      expect(deps.ensureRepository).toHaveBeenCalledWith(
        expect.objectContaining({ expectExisting: false }),
      );
      expect(deps.pushRelease).toHaveBeenCalledWith(
        expect.objectContaining({ branch: "gh-pages" }),
      );
    },
  );

  it.each(["gh-pages", "main"])(
    "only recognizes a same-destination record with a safe %s branch",
    async (branch) => {
      const deps = dependencies({
        authorizeRepository: vi.fn(async () => authorized()),
        readPublishRecord: vi.fn(async () => ({
          owner: "map-org",
          repo: "coast",
          repositoryId: 42,
          branch,
          url: "https://map-org.github.io/coast/",
          buildId: "old",
          publishedAt: "2026-08-01T00:00:00.000Z",
        })),
      });
      const jobs = new PagesJobs(store, deps);
      const { id } = await jobs.create("story-1", {
        repositoryId: 42,
        reviewedRepository: reviewed(),
      });
      await settle(jobs, id);
      expect(deps.ensureRepository).toHaveBeenCalledWith(
        expect.objectContaining({ expectExisting: branch === "gh-pages" }),
      );
      expect(deps.pushRelease).toHaveBeenCalledWith(
        expect.objectContaining({ branch: "gh-pages" }),
      );
    },
  );

  it.each([undefined, 99])(
    "does not trust a legacy or replaced repository ID %s",
    async (repositoryId) => {
      const deps = dependencies({
        authorizeRepository: vi.fn(async () => authorized()),
        readPublishRecord: vi.fn(async () => ({
          owner: "map-org",
          repo: "coast",
          repositoryId,
          branch: "gh-pages",
          url: "https://map-org.github.io/coast/",
          buildId: "old",
          publishedAt: "2026-08-01T00:00:00.000Z",
        })),
      });
      const jobs = new PagesJobs(store, deps);
      const { id } = await jobs.create("story-1", {
        repositoryId: 42,
        reviewedRepository: reviewed(),
      });
      const result = await settle(jobs, id);
      expect(deps.ensureRepository).toHaveBeenCalledWith(
        expect.objectContaining({ expectExisting: false }),
      );
      expect(result.record?.repositoryId).toBe(42);
    },
  );

  it("uses full authorization at stage boundaries and cheap checks for individual writes", async () => {
    const assertAuthorizationCurrent = vi.fn();
    const deps = dependencies({
      authorizeRepository: vi.fn(async () => authorized()),
      assertAuthorizationCurrent,
      pushRelease: vi.fn(async (options) => {
        for (let i = 0; i < 100; i++) await options.beforeWrite?.();
        await options.beforeRefUpdate?.();
        return { branch: "gh-pages" };
      }),
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1", {
      repositoryId: 42,
      reviewedRepository: reviewed(),
    });
    expect((await settle(jobs, id)).status).toBe("succeeded");
    expect(deps.authorizeRepository).toHaveBeenCalledTimes(5);
    expect(assertAuthorizationCurrent).toHaveBeenCalledTimes(100);
    expect(assertAuthorizationCurrent).toHaveBeenCalledWith(
      authorized().identity,
      authorized().repository,
    );
  });

  it.each(["revoked", "name", "id"])(
    "revalidates remote %s changes before replacing the publication ref",
    async (change) => {
      let checks = 0;
      let replacedRef = false;
      const deps = dependencies({
        authorizeRepository: vi.fn(async () => {
          const value = authorized();
          if (++checks === 4) {
            if (change === "revoked")
              throw new Error("Repository access revoked");
            if (change === "name") value.repository.name = "renamed";
            if (change === "id") value.repository.id = 99;
          }
          return value;
        }),
        pushRelease: vi.fn(async (options) => {
          await options.beforeWrite?.();
          await options.beforeRefUpdate?.();
          replacedRef = true;
          return { branch: "gh-pages" };
        }),
      });
      const jobs = new PagesJobs(store, deps);
      const { id } = await jobs.create("story-1", {
        repositoryId: 42,
        reviewedRepository: reviewed(),
      });
      expect((await settle(jobs, id)).status).toBe("failed");
      expect(replacedRef).toBe(false);
      expect(deps.enablePages).not.toHaveBeenCalled();
    },
  );

  it("stops individual writes when the local connection changes", async () => {
    const deps = dependencies({
      authorizeRepository: vi.fn(async () => authorized()),
      assertAuthorizationCurrent: () => {
        throw new Error("Connection changed");
      },
      pushRelease: vi.fn(async (options) => {
        await options.beforeWrite?.();
        return { branch: "gh-pages" };
      }),
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1", {
      repositoryId: 42,
      reviewedRepository: reviewed(),
    });
    expect((await settle(jobs, id)).error).toMatch(/Connection changed/);
    expect(deps.enablePages).not.toHaveBeenCalled();
  });

  it("cancels repository authorization without building or writing", async () => {
    let finish!: () => void;
    const deps = dependencies({
      authorizeRepository: vi.fn(async (_id, signal) => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        expect(signal?.aborted).toBe(true);
        return authorized();
      }),
    });
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1", {
      repositoryId: 42,
      reviewedRepository: reviewed(),
    });
    jobs.cancelRunning();
    finish();
    await jobs.whenIdle();
    expect(jobs.get(id)?.status).toBe("failed");
    expect(deps.build).not.toHaveBeenCalled();
    expect(deps.ensureRepository).not.toHaveBeenCalled();
  });

  it("requires explicit connection by default rather than discovering credentials", async () => {
    const deps = dependencies();
    delete deps.resolveToken;
    const jobs = new PagesJobs(store, deps);
    const { id } = await jobs.create("story-1");
    expect((await settle(jobs, id)).error).toMatch(/Connect GitHub/);
    expect(deps.build).not.toHaveBeenCalled();
  });
});
