import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, join, relative, isAbsolute } from "node:path";
import { ProjectStore } from "@earth-stories/project-store";
import { compileProject } from "@earth-stories/publisher/compile";
import {
  generationJobSchema,
  storyBriefSchema,
  referenceInputSchema,
  generationPlanIssues,
  storyPlanSchema,
  type GenerationJob,
  type GenerationProvider,
  type StoryBrief,
  type PreparedReference,
} from "@earth-stories/story-schema";
import { prepareReferences, normalizeRaster } from "./reference-inputs.js";
import { assembleCandidate, digestBytes } from "./candidate.js";
const activeStages = new Set([
  "queued",
  "planning",
  "illustrating",
  "assembling",
  "validating",
]);
async function atomic(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(
      value instanceof Uint8Array ? value : JSON.stringify(value),
    );
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
export class GenerationJobs {
  readonly root: string;
  private readonly locks = new Map<string, Promise<unknown>>();
  private running: {
    id: string;
    controller: AbortController;
    promise: Promise<void>;
  } | null = null;
  private starting = false;
  private closed = false;
  private realRoot: string | null = null;
  constructor(
    private readonly store: ProjectStore,
    readonly provider: GenerationProvider,
  ) {
    this.root = join(store.root, ".generation");
  }
  private async lock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.locks.set(id, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(id) === next) this.locks.delete(id);
    }
  }
  private directory(id: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))
      throw new Error("Invalid generation ID.");
    return join(this.root, id);
  }
  private async contained(id: string, path: string) {
    const base = this.directory(id);
    const root = await realpath(base);
    if (
      !this.realRoot ||
      root !== join(this.realRoot, id) ||
      (await realpath(this.root)) !== this.realRoot
    )
      throw new Error("Generation paths cannot use symbolic links.");
    let component = base;
    for (const part of path.split("/").filter((part) => part !== ".")) {
      component = join(component, part);
      if ((await lstat(component)).isSymbolicLink())
        throw new Error("Generation paths cannot use symbolic links.");
    }
    const target = await realpath(join(base, path));
    const rel = relative(root, target);
    if (rel.startsWith("..") || isAbsolute(rel))
      throw new Error("Generation path escapes its directory.");
    if ((await lstat(join(base, path))).isSymbolicLink())
      throw new Error("Generation files cannot use symbolic links.");
    return target;
  }
  async initialize() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await lstat(this.root)).isSymbolicLink())
      throw new Error("Generation directory cannot be a symbolic link.");
    this.realRoot = await realpath(this.root);
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const job = await this.get(entry.name);
        if (!job.referenceStorage && job.brief.references.length) {
          await this.separateInputs(job);
          await this.save(job);
        }
        if (activeStages.has(job.stage)) {
          job.stage = "failed";
          job.error =
            "Generation was interrupted when the service stopped. Retry to reuse completed artwork.";
          await this.save(job);
        }
      } catch {
        /* Invalid staging records are not opened as projects. */
      }
    }
  }
  private async separateInputs(job: GenerationJob) {
    await this.contained(job.id, ".");
    await atomic(
      join(this.directory(job.id), "inputs.json"),
      job.brief.references,
    );
    job.referenceMetadata = job.brief.references.map((reference) => ({
      kind: reference.kind,
      name: reference.name,
      classification: reference.classification,
      ...(reference.kind === "upload"
        ? { mediaType: reference.mediaType }
        : {}),
      ...(reference.kind === "url" ? { url: reference.url } : {}),
    }));
    job.referenceStorage = "separate";
    job.brief = { ...job.brief, references: [] };
  }
  private async save(job: GenerationJob) {
    job.updatedAt = new Date().toISOString();
    await this.contained(job.id, ".");
    await atomic(
      join(this.directory(job.id), "job.json"),
      generationJobSchema.parse(job),
    );
  }
  async get(id: string): Promise<GenerationJob> {
    return generationJobSchema.parse(
      JSON.parse(await readFile(await this.contained(id, "job.json"), "utf8")),
    );
  }
  private async change(
    id: string,
    change: (job: GenerationJob) => void,
    signal?: AbortSignal,
  ) {
    return this.lock(id, async () => {
      signal?.throwIfAborted();
      const job = await this.get(id);
      signal?.throwIfAborted();
      change(job);
      await this.save(job);
      return job;
    });
  }
  async start(input: unknown): Promise<GenerationJob> {
    if (!this.provider.configured)
      throw new Error("OpenAI API credentials are not configured.");
    if (this.closed || this.running || this.starting)
      throw new Error(
        "Another generation is running. Wait or cancel it first.",
      );
    this.starting = true;
    try {
      const brief = storyBriefSchema.parse(input);
      const id = randomUUID();
      await mkdir(this.directory(id), { mode: 0o700 });
      await mkdir(join(this.directory(id), "assets"));
      const now = new Date().toISOString();
      const job: GenerationJob = {
        id,
        stage: "queued",
        brief,
        plan: null,
        assets: [],
        candidate: null,
        error: null,
        createdAt: now,
        updatedAt: now,
        usage: [],
        acceptance: null,
      };
      await this.separateInputs(job);
      await this.save(job);
      this.launch(id);
      return job;
    } finally {
      this.starting = false;
    }
  }
  private launch(id: string) {
    const controller = new AbortController();
    const active = { id, controller, promise: Promise.resolve() };
    this.running = active;
    active.promise = this.run(id, controller.signal)
      .catch(() => {})
      .finally(() => {
        if (this.running === active) this.running = null;
      });
  }
  private async run(id: string, signal: AbortSignal) {
    try {
      let job = await this.change(
        id,
        (j) => {
          j.stage = "planning";
          j.error = null;
          j.candidate = null;
        },
        signal,
      );
      const refsPath = join(this.directory(id), "references.json");
      let references: PreparedReference[];
      try {
        references = JSON.parse(
          await readFile(await this.contained(id, "references.json"), "utf8"),
        );
      } catch {
        const inputs =
          job.referenceStorage === "separate"
            ? referenceInputSchema
                .array()
                .max(20)
                .parse(
                  JSON.parse(
                    await readFile(
                      await this.contained(id, "inputs.json"),
                      "utf8",
                    ),
                  ),
                )
            : job.brief.references;
        references = await prepareReferences(inputs, signal);
        signal.throwIfAborted();
        await atomic(refsPath, references);
      }
      if (!job.plan) {
        const result = await this.provider.plan(job.brief, references, signal);
        const plan = storyPlanSchema.parse(result.plan);
        const issues = generationPlanIssues(plan, job.brief);
        if (issues.length) throw new Error(issues.join(" "));
        job = await this.change(
          id,
          (j) => {
            j.plan = plan;
            j.usage.push(result.usage);
          },
          signal,
        );
      }
      job = await this.change(
        id,
        (j) => {
          j.stage = "illustrating";
        },
        signal,
      );
      for (const request of job.plan!.artwork) {
        signal.throwIfAborted();
        const cached = job.assets.find((a) => a.id === request.id);
        if (cached) {
          try {
            const bytes = await this.asset(id, cached.path);
            if (digestBytes(bytes) === cached.digest) continue;
          } catch {
            /* Regenerate a missing or damaged checkpoint. */
          }
        }
        const result = await this.provider.illustrate(
          request,
          references,
          signal,
        );
        signal.throwIfAborted();
        const bytes = await normalizeRaster(result.bytes);
        signal.throwIfAborted();
        const digest = digestBytes(bytes),
          path = `assets/${digest}.png`;
        if (
          job.assets
            .filter((a) => a.id !== request.id)
            .reduce((sum, a) => sum + a.sizeBytes, 0) +
            bytes.length >
          100 * 1024 * 1024
        )
          throw new Error(
            "Generated assets exceed the 100 MiB candidate limit.",
          );
        await this.contained(id, "assets");
        await atomic(join(this.directory(id), path), bytes);
        job = await this.change(
          id,
          (j) => {
            j.assets = j.assets.filter((a) => a.id !== request.id);
            j.assets.push({
              id: request.id,
              path,
              digest,
              sizeBytes: bytes.length,
              mediaType: "image/png",
              model: result.model,
              prompt: request.prompt,
            });
            j.usage.push(result.usage);
          },
          signal,
        );
      }
      job = await this.change(
        id,
        (j) => {
          j.stage = "assembling";
        },
        signal,
      );
      const candidate = assembleCandidate(job);
      await this.change(
        id,
        (j) => {
          j.stage = "validating";
        },
        signal,
      );
      for (const asset of candidate.assets) {
        const bytes = await this.asset(id, asset.path);
        if (digestBytes(bytes) !== asset.digest)
          throw new Error("Generated artwork failed integrity validation.");
      }
      await this.change(
        id,
        (j) => {
          j.candidate = candidate;
          j.stage = "ready";
        },
        signal,
      );
    } catch (cause) {
      await this.change(id, (j) => {
        if (j.stage === "accepted") return;
        j.stage = signal.aborted ? "cancelled" : "failed";
        j.error = signal.aborted
          ? "Generation cancelled."
          : cause instanceof Error
            ? cause.message
            : "Generation could not finish.";
      }).catch(() => {});
    }
  }
  async retry(id: string) {
    return this.lock("service-start", async () => {
      if (this.closed || this.running || this.starting)
        throw new Error("Another generation is running.");
      if (!this.provider.configured)
        throw new Error("OpenAI API credentials are not configured.");
      this.starting = true;
      try {
        const job = await this.get(id);
        if (job.stage !== "failed" && job.stage !== "cancelled")
          throw new Error("Only failed or cancelled jobs can be retried.");
        const updated = await this.change(id, (j) => {
          j.stage = "queued";
          j.error = null;
        });
        this.launch(id);
        return updated;
      } finally {
        this.starting = false;
      }
    });
  }
  async cancel(id: string) {
    if (this.running?.id === id) this.running.controller.abort();
    return this.change(id, (j) => {
      if (activeStages.has(j.stage)) {
        j.stage = "cancelled";
        j.error = "Generation cancelled.";
      }
    });
  }
  async asset(id: string, path: string) {
    if (!/^assets\/[a-f0-9]{64}\.png$/.test(path))
      throw new Error("Invalid generation asset.");
    const bytes = await readFile(await this.contained(id, path));
    if (
      bytes.length > 20 * 1024 * 1024 ||
      digestBytes(bytes) !== path.slice(7, -4)
    )
      throw new Error("Generation asset failed integrity validation.");
    return bytes;
  }
  async preview(id: string) {
    const job = await this.get(id);
    if (!job.candidate || !["ready", "accepted"].includes(job.stage))
      throw new Error("This candidate is not ready.");
    const { digest, ...candidateData } = job.candidate;
    if (digestBytes(JSON.stringify(candidateData)) !== digest)
      throw new Error("Candidate integrity check failed.");
    const manifest = compileProject(job.candidate.project);
    for (const asset of manifest.assets) {
      const source = job.candidate.assets.find((a) => a.id === asset.id);
      if (source) asset.href = `/api/generation/jobs/${id}/${source.path}`;
    }
    return manifest;
  }
  async accept(id: string) {
    return this.lock(id, async () => {
      const job = await this.get(id);
      if (job.stage === "accepted" && job.acceptance) return job.acceptance;
      if (job.stage !== "ready" || !job.candidate)
        throw new Error("Preview a ready candidate before creating the story.");
      const { digest, ...data } = job.candidate;
      if (digestBytes(JSON.stringify(data)) !== digest)
        throw new Error("Candidate integrity check failed.");
      job.acceptance ??= {
        projectId: job.candidate.project.id,
        candidateDigest: digest,
      };
      await this.save(job);
      const assets = await Promise.all(
        job.candidate.assets.map(async (a) => ({
          ...a,
          contents: await this.asset(id, a.path),
        })),
      );
      await this.store.importCandidate({
        destinationId: job.acceptance.projectId,
        jobId: id,
        digest,
        project: job.candidate.project,
        assets,
        brief: { ...job.brief, referenceMetadata: job.referenceMetadata ?? [] },
      });
      job.stage = "accepted";
      await this.save(job);
      return job.acceptance;
    });
  }
  async discard(id: string) {
    if (this.running?.id === id) {
      await this.cancel(id);
      await this.whenIdle();
    }
    return this.lock(id, async () => {
      await this.get(id);
      await this.contained(id, ".");
      await rm(this.directory(id), { recursive: true, force: true });
    });
  }
  activity() {
    return this.running ? 1 : 0;
  }
  close() {
    this.closed = true;
    this.running?.controller.abort();
  }
  async whenIdle() {
    await this.running?.promise;
  }
}
