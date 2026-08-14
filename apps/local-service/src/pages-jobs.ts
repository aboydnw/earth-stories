import type { ProjectStore } from "@earth-stories/project-store";
import {
  buildLatestPublication,
  preflightPublication,
} from "@earth-stories/publisher";
import { checkShareLink } from "./share-health.js";
import {
  resolveToken,
  type DeviceCodePrompt,
  type GitHubIdentity,
} from "./github-auth.js";
import {
  DEFAULT_PAGES_BRANCH,
  enablePages,
  ensureRepository,
  pagesUrl,
  pushRelease,
  slugRepoName,
  waitForPages,
} from "./pages-deploy.js";
import {
  checkEstimatedSize,
  checkReleaseLimits,
  inspectRelease,
} from "./publish-limits.js";
import {
  readPublishRecord,
  writePublishRecord,
  type PublishRecord,
} from "./publish-record.js";

export type PublishJobStatus = "queued" | "running" | "succeeded" | "failed";

export type PublishStage =
  | "signing-in"
  | "checking"
  | "building"
  | "preparing-repository"
  | "uploading"
  | "enabling-pages"
  | "waiting-for-site"
  | "verifying"
  | "done";

export interface PublishJobEvent {
  stage: PublishStage;
  severity: "info" | "warning";
  message: string;
  at: string;
}

export interface PublishJobSnapshot {
  id: string;
  projectId: string;
  status: PublishJobStatus;
  stage: PublishStage;
  events: PublishJobEvent[];
  deviceCode: DeviceCodePrompt | null;
  url: string | null;
  record: PublishRecord | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PagesJobsDependencies {
  resolveToken: typeof resolveToken;
  preflight: typeof preflightPublication;
  build: typeof buildLatestPublication;
  ensureRepository: typeof ensureRepository;
  pushRelease: typeof pushRelease;
  enablePages: typeof enablePages;
  waitForPages: typeof waitForPages;
  checkShareLink: typeof checkShareLink;
  inspectRelease: typeof inspectRelease;
  readPublishRecord: typeof readPublishRecord;
  writePublishRecord: typeof writePublishRecord;
  viewerDirectory?: string;
  withLock?: <T>(projectId: string, operation: () => Promise<T>) => Promise<T>;
}

const defaults = (): PagesJobsDependencies => ({
  resolveToken,
  preflight: preflightPublication,
  build: buildLatestPublication,
  ensureRepository,
  pushRelease,
  enablePages,
  waitForPages,
  checkShareLink,
  inspectRelease,
  readPublishRecord,
  writePublishRecord,
});

export interface StartPublishInput {
  repo?: unknown;
  mapSnapshots?: unknown;
}

/**
 * Runs GitHub Pages publishes as polled background jobs, because a publish
 * takes minutes: the release is built, pushed, and then waited on while Pages
 * performs its own build. Mirrors the conversion-job shape the editor already
 * knows how to poll. Signing in happens before the project lock is taken, so
 * an author typing a device code does not block exports of the same project.
 */
export class PagesJobs {
  readonly #jobs = new Map<string, PublishJobSnapshot>();
  readonly #controllers = new Map<string, AbortController>();
  readonly #idleWaiters = new Set<() => void>();
  readonly #store: ProjectStore;
  readonly #deps: PagesJobsDependencies;
  #accepting = true;

  constructor(store: ProjectStore, deps: Partial<PagesJobsDependencies> = {}) {
    this.#store = store;
    this.#deps = { ...defaults(), ...deps };
  }

  get(id: string): PublishJobSnapshot | null {
    return this.#jobs.get(id) ?? null;
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

  whenIdle(): Promise<void> {
    if (this.#controllers.size === 0) return Promise.resolve();
    return new Promise((resolveIdle) => this.#idleWaiters.add(resolveIdle));
  }

  async record(projectId: string): Promise<PublishRecord | null> {
    await this.#store.read(projectId);
    return this.#deps.readPublishRecord(this.#store.projectPath(projectId));
  }

  async create(
    projectId: string,
    input: StartPublishInput = {},
  ): Promise<PublishJobSnapshot> {
    if (!this.#accepting)
      throw new Error(
        "The local service is shutting down and cannot start new jobs.",
      );
    const project = await this.#store.read(projectId);
    const existing = await this.#deps.readPublishRecord(
      this.#store.projectPath(projectId),
    );
    if (!this.#accepting)
      throw new Error(
        "The local service is shutting down and cannot start new jobs.",
      );
    const requested =
      typeof input.repo === "string" && input.repo.trim()
        ? slugRepoName(input.repo)
        : (existing?.repo ?? slugRepoName(project.metadata.title));
    const snapshots =
      input.mapSnapshots &&
      typeof input.mapSnapshots === "object" &&
      input.mapSnapshots !== null
        ? (input.mapSnapshots as Record<string, string>)
        : undefined;

    const now = new Date().toISOString();
    const snapshot: PublishJobSnapshot = {
      id: crypto.randomUUID(),
      projectId,
      status: "queued",
      stage: "signing-in",
      events: [],
      deviceCode: null,
      url: null,
      record: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.#jobs.set(snapshot.id, snapshot);
    const controller = new AbortController();
    this.#controllers.set(snapshot.id, controller);
    void this.#run(
      snapshot,
      { repo: requested, existing, snapshots },
      controller,
    );
    return snapshot;
  }

  #note(
    snapshot: PublishJobSnapshot,
    stage: PublishStage,
    message: string,
    severity: "info" | "warning" = "info",
  ): void {
    snapshot.stage = stage;
    snapshot.events.push({
      stage,
      severity,
      message,
      at: new Date().toISOString(),
    });
    snapshot.updatedAt = new Date().toISOString();
  }

  #progress(snapshot: PublishJobSnapshot, message: string): void {
    const latest = snapshot.events.at(-1);
    const event = {
      stage: "uploading" as const,
      severity: "info" as const,
      message,
      at: new Date().toISOString(),
    };
    if (latest?.stage === "uploading" && latest.message.startsWith("Uploaded "))
      snapshot.events[snapshot.events.length - 1] = event;
    else snapshot.events.push(event);
    snapshot.stage = "uploading";
    snapshot.updatedAt = event.at;
  }

  async #run(
    snapshot: PublishJobSnapshot,
    context: {
      repo: string;
      existing: PublishRecord | null;
      snapshots?: Record<string, string>;
    },
    controller: AbortController,
  ): Promise<void> {
    const projectDirectory = this.#store.projectPath(snapshot.projectId);
    const withLock =
      this.#deps.withLock ?? (<T>(_id: string, run: () => Promise<T>) => run());
    let token: string | null = null;
    snapshot.status = "running";
    snapshot.updatedAt = new Date().toISOString();

    try {
      this.#note(snapshot, "signing-in", "Signing in to GitHub…");
      const identity: GitHubIdentity = await this.#deps.resolveToken({
        signal: controller.signal,
        onDeviceCode: (prompt) => {
          snapshot.deviceCode = prompt;
          this.#note(
            snapshot,
            "signing-in",
            `Enter code ${prompt.userCode} at ${prompt.verificationUri} to continue.`,
          );
        },
      });
      if (controller.signal.aborted)
        throw new Error("Publishing was canceled.");
      token = identity.token;
      snapshot.deviceCode = null;
      await withLock(snapshot.projectId, async () => {
        if (controller.signal.aborted)
          throw new Error("Publishing was canceled.");
        this.#note(
          snapshot,
          "checking",
          `Signed in as ${identity.login}. Checking the story…`,
        );

        const preflight = await this.#deps.preflight(projectDirectory);
        if (controller.signal.aborted)
          throw new Error("Publishing was canceled.");
        if (!preflight.ready)
          throw new Error(
            "Fix the blocking publication problems before publishing to the web.",
          );
        const estimate = checkEstimatedSize(
          preflight.estimatedIncludedBytes,
          preflight.profile,
        );
        if (estimate.blocked) throw new Error(estimate.message ?? "");
        if (estimate.message)
          this.#note(snapshot, "checking", estimate.message, "warning");

        const url = pagesUrl(identity.login, context.repo);
        snapshot.url = url;
        this.#note(snapshot, "building", `Building the release for ${url}`);
        const built = await this.#deps.build({
          projectDirectory,
          viewerDirectory: this.#deps.viewerDirectory,
          mapSnapshots: context.snapshots,
          publicationUrl: url,
        });
        if (controller.signal.aborted)
          throw new Error("Publishing was canceled.");

        const limits = checkReleaseLimits(
          await this.#deps.inspectRelease(built.directory),
        );
        if (controller.signal.aborted)
          throw new Error("Publishing was canceled.");
        if (limits.blocked) throw new Error(limits.message ?? "");
        if (limits.message)
          this.#note(snapshot, "building", limits.message, "warning");

        this.#note(
          snapshot,
          "preparing-repository",
          `Preparing github.com/${identity.login}/${context.repo}`,
        );
        await this.#deps.ensureRepository({
          token: identity.token,
          owner: identity.login,
          repo: context.repo,
          projectId: snapshot.projectId,
          expectExisting:
            context.existing?.repo === context.repo &&
            context.existing.owner === identity.login,
        });
        if (controller.signal.aborted)
          throw new Error("Publishing was canceled.");

        const branch = context.existing?.branch ?? DEFAULT_PAGES_BRANCH;
        this.#note(snapshot, "uploading", "Uploading the release…");
        let acceptingUploadProgress = true;
        try {
          await this.#deps.pushRelease({
            directory: built.directory,
            token: identity.token,
            owner: identity.login,
            repo: context.repo,
            branch,
            signal: controller.signal,
            onProgress: ({ uploaded, skipped }) => {
              if (!acceptingUploadProgress) return;
              const uploadedLabel = uploaded === 1 ? "file" : "files";
              const skippedLabel = skipped === 1 ? "file" : "files";
              this.#progress(
                snapshot,
                `Uploaded ${uploaded} ${uploadedLabel}; skipped ${skipped} unchanged ${skippedLabel}.`,
              );
            },
          });
          if (controller.signal.aborted)
            throw new Error("Publishing was canceled.");
        } finally {
          acceptingUploadProgress = false;
        }

        this.#note(snapshot, "enabling-pages", "Turning on GitHub Pages…");
        await this.#deps.enablePages({
          token: identity.token,
          owner: identity.login,
          repo: context.repo,
          branch,
        });
        if (controller.signal.aborted)
          throw new Error("Publishing was canceled.");

        this.#note(
          snapshot,
          "waiting-for-site",
          "Waiting for GitHub to build the site. The first build takes a minute or two…",
        );
        const served = await this.#deps.waitForPages(url, {
          signal: controller.signal,
        });
        if (controller.signal.aborted)
          throw new Error("Publishing was canceled.");
        if (!served)
          this.#note(
            snapshot,
            "waiting-for-site",
            "GitHub is still building the site. The link will start working shortly.",
            "warning",
          );

        if (served) {
          this.#note(snapshot, "verifying", "Checking how the link will look…");
          const health = await this.#deps.checkShareLink(url);
          for (const problem of health.problems)
            this.#note(
              snapshot,
              "verifying",
              problem.resolution
                ? `${problem.message} ${problem.resolution}`
                : problem.message,
              "warning",
            );
        }

        const record: PublishRecord = {
          owner: identity.login,
          repo: context.repo,
          url,
          branch,
          buildId: built.manifest.build.id,
          publishedAt: new Date().toISOString(),
        };
        await this.#deps.writePublishRecord(projectDirectory, record);
        snapshot.record = record;
        snapshot.status = "succeeded";
        this.#note(snapshot, "done", `Published at ${url}`);
      });
    } catch (cause) {
      snapshot.status = "failed";
      snapshot.deviceCode = null;
      const message =
        cause instanceof Error
          ? cause.message
          : "The story could not be published.";
      snapshot.error = token
        ? message.split(token).join("[REDACTED]")
        : message;
      snapshot.events.push({
        stage: snapshot.stage,
        severity: "warning",
        message: snapshot.error,
        at: new Date().toISOString(),
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
