# AI story creation and candidate acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a real illustrated story from one brief, preview locally, and create an editable project only on acceptance.

**Architecture:** Keep provider calls and durable generation jobs in the loopback service. Candidates compile through the shared publisher/viewer; the store imports a validated candidate atomically with an idempotent receipt. Requires plan 02.

**Tech Stack:** TypeScript, React, Zod, Vite, Vitest, Testing Library, existing Yarn workspace packages; OpenAI HTTP APIs only in the generation stage.

**Design:** [Approved design](../specs/2026-11-19-ai-story-creation-design.md). Status: implemented on the stacked review branches; see execution evidence below. Individual planning checkboxes retain the original proposed sequence.

## Global Constraints

- Node.js 22+; Corepack with yarn@4.13.0.
- Editable StoryProject and compiled PublicationManifest remain separate.
- packages/viewer is the sole interactive renderer for editor and publication.
- Product chrome uses @earth-stories/ui; generated palettes affect reader content only.
- Filesystem access and credentials remain in the loopback service/store.
- Stable IDs, atomic saves, backups, deterministic compilation, and explicit provenance remain authoritative.
- No generated executable JavaScript, arbitrary CSS, or HTML is accepted as story content.
- No publishing or external deployment occurs as a generation side effect.
- No real author projects are used as disposable test fixtures.

## Execution preparation

- [ ] Read AGENTS.md, README.md, docs/product.md, docs/architecture.md, and relevant domain guides listed in AGENTS.md.
- [ ] Use the using-git-worktrees workflow to create an isolated codex/ branch from up-to-date main. Preserve all unrelated local changes. For dependent plans, first confirm prerequisite changes are integrated or explicitly use a reviewed dependency branch.
- [ ] Run `node --version`, `corepack enable`, and `yarn install`. Confirm Node.js 22+ and pinned Yarn; record existing failures before editing.
- [ ] Inspect existing code/tests at the named integration points before applying snippets. Snippets define contracts and algorithms; integrate them with existing imports and fixtures.

### Task 1: Define brief/job contracts and bounded reference ingestion

**Files:** Create packages/story-schema/src/generation.ts and generation.test.ts; apps/local-service/src/generation/reference-inputs.ts and reference-inputs.test.ts; modify schema index.ts.

**Interfaces:** Export StoryBrief, GenerationJob, GenerationCandidate, GenerationProvider. StoryBrief fields: title, audience, takeaway, narrative, visualDirection, references, requestedOutputs. Provider methods plan(brief,signal), illustrate(request,signal); outputs are validated data and asset bytes, never executable code.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```ts
expect(
  storyBriefSchema.safeParse({
    title: "Water",
    audience: "Public",
    takeaway: "Follow the river",
    narrative: "",
    visualDirection: "Ink",
    references: [],
    requestedOutputs: ["illustration"],
  }).success,
).toBe(true);
```

Reference tests reject loopback/private/link-local URLs, credential URLs, redirected private targets, oversized responses, invalid MIME signatures, malformed PDFs, and scanned PDFs without extractable text. Include public-host DNS rebinding protection tests and instruction-like text that remains reference data.

- [ ] Run `yarn test packages/story-schema/src/generation.test.ts apps/local-service/src/generation/reference-inputs.test.ts` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```ts
export type GenerationStage =
  | "queued"
  | "planning"
  | "illustrating"
  | "assembling"
  | "validating"
  | "ready"
  | "failed"
  | "cancelled"
  | "accepted";
export interface GenerationProvider {
  plan(brief: StoryBrief, signal: AbortSignal): Promise<StoryPlan>;
  illustrate(
    request: IllustrationRequest,
    signal: AbortSignal,
  ): Promise<GeneratedImage>;
}
```

Define StoryPlan as palette plus chapter descriptors and artwork requests; IllustrationRequest as stable id, prompt, bounded reference asset IDs and dimensions; GeneratedImage as bytes, media type and provider provenance. GenerationCandidate contains validated project, local asset inventory with digests, warnings, and digest. Job stores id, stage, brief, candidate, acceptance receipt, error, usage and timestamps. Bound references to 20, uploads to 20 MiB each, text to 200k characters total; enforce aggregate asset limits from spec. Use a vetted PDF text parser and raster decoder selected after checking existing dependencies/licenses. Pin approved dependencies. HTTPS retrieval validates DNS and pins the resolved public address for connection, revalidates every redirect, caps redirects at three, times out after 20s, and never forwards credentials. Raster ingestion re-encodes valid PNG/JPEG/WebP; reject SVG uploads.

- [ ] Run `yarn test packages/story-schema/src/generation.test.ts apps/local-service/src/generation/reference-inputs.test.ts` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `feat: define generation briefs and reference ingestion`.

### Task 2: Implement real OpenAI planning and artwork adapter

**Files:** Create apps/local-service/src/generation/openai-provider.ts, openai-provider.test.ts; modify config.ts and config.test.ts; add credential configuration guidance to README.md.

**Interfaces:** Implement GenerationProvider from Task 1. Config reads OPENAI_API_KEY plus explicit planning/image model names; UI receives only configured status. Provider request helpers accept AbortSignal and return redacted errors plus usage.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```ts
expect(JSON.stringify(publicJob)).not.toContain("test-secret-key");
expect(request.headers.Authorization).toBe("Bearer test-secret-key");
```

Use intercepted HTTP responses to test schema-invalid plans, invalid image payload, 401, 429 Retry-After, transient 5xx, cancellation, timeout, and provider output containing unknown asset IDs. Confirm two transient retries maximum and one plan repair maximum; 401 is not retried.

- [ ] Run `yarn test apps/local-service/src/generation/openai-provider.test.ts apps/local-service/src/config.test.ts` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```ts
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OpenAI API credentials are not configured");
// Pass key only to the provider HTTP adapter; redact headers and raw error bodies.
```

Before coding requests, fetch current official structured-output and image-generation API documentation, select supported model IDs explicitly, and record them in configuration docs/tests. Use structured planning output constrained by StoryPlan. Image requests generate actual assets with per-layer prompts and consistent palette/style references. Treat quoted reference content as data. Never allow the agent shell access or arbitrary tools. Check model access up front; fail clearly instead of silently substituting a different model. Constrain the job to 30 chapters, 12 scenes, and 24 image-generation calls; retry budgets apply separately. Store available usage and show an API-charges notice before Generate; do not claim a strict dollar ceiling.

- [ ] Run `yarn test apps/local-service/src/generation/openai-provider.test.ts apps/local-service/src/config.test.ts` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `feat: generate story plans and artwork through OpenAI`.

### Task 3: Persist staged jobs and compile local candidates

**Files:** Create apps/local-service/src/generation/jobs.ts, jobs.test.ts, routes.ts, routes.test.ts, candidate.ts, candidate.test.ts; integrate server.ts and runtime.ts.

**Interfaces:** Job manager exposes start(brief), get(id), cancel(id), retry(id). Routes: POST /api/generation/jobs, GET /api/generation/jobs/:id, POST .../:id/cancel, POST .../:id/retry, GET .../:id/preview and GET .../:id/assets/*. Preview response is a compiled manifest.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```ts
expect((await jobs.get(jobId)).stage).toBe("ready");
expect(await store.list()).toEqual([]); // fixture store: ready candidates are not projects
```

Test cancellation during artwork requests; late provider completions cannot promote cancelled jobs. Restart interrupts active work, retry reuses completed digested assets, duplicate retry requests do not start two jobs, invalid references block ready, and staging asset routes reject encoded traversal/symlinks. Exercise every transition with deterministic provider mocks.

- [ ] Run `yarn test apps/local-service/src/generation` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```ts
const stages = [
  "planning",
  "illustrating",
  "assembling",
  "validating",
] as const;
// Persist each stage transition atomically under the job lock.
// After every awaited provider operation, recheck cancellation before writing/promoting.
```

Store jobs outside project listing under a hidden service-owned directory. Use atomic metadata writes and content-addressed assets; do not embed credentials or original API error bodies. Construct chapters from validated plan IDs, bind assets, preserve sources and authored/generated provenance, compile via the existing compiler, and validate contrast/asset closure. Keep placeholder prose explicit; unknown factual datasets fail validation. Candidate preview is immutable for its digest. Expose polling progress and cancellable jobs with no general filesystem API. Reserve a maximum of one active job per service in the pilot to bound load; return a visible busy response for another request.

- [ ] Run `yarn test apps/local-service/src/generation` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `feat: persist resumable story generation candidates`.

### Task 4: Import accepted candidates exactly once

**Files:** Create packages/project-store/src/importCandidate.ts, importCandidate.test.ts; modify store.ts and index.ts; add acceptance handler/tests in generation/routes.ts and routes.test.ts.

**Interfaces:** ProjectStore.importCandidate(input: CandidateImport): Promise<StoryProject>; CandidateImport includes stable destinationId, validated project, contained assets and digest. POST /api/generation/jobs/:id/accept returns {projectId,candidateDigest}.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```ts
const [a, b] = await Promise.all([accept(jobId), accept(jobId)]);
expect(a.projectId).toBe(b.projectId);
expect(await store.list()).toHaveLength(1);
```

Inject crashes before rename, after rename, and before receipt write; restart/retry returns the same project. Failed copies leave no visible project. Existing destination with a different digest is a conflict, never overwritten. Compare preview and imported manifest content after normalizing project ID/base URLs.

- [ ] Run `yarn test packages/project-store/src apps/local-service/src/generation/routes.test.ts` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```ts
// Under the job lock:
// 1. Persist destinationId and candidateDigest before import.
// 2. If destination exists, verify private import receipt matches digest/job identity.
// 3. Otherwise copy validated assets into hidden sibling, write project + receipt,
//    flush files, and atomically rename into the workspace.
// 4. Persist accepted state; repeated acceptance returns the same destinationId.
```

Implement a dedicated import path; do not weaken createFromTemplate's example-ID checks. Reuse store containment, locking and atomic-file helpers. Persist the original brief/provenance privately and exclude unused reference files from publication. Do not copy the candidate's temporary absolute paths into project data.

- [ ] Run `yarn test packages/project-store/src apps/local-service/src/generation/routes.test.ts` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `feat: accept generated stories atomically`.

### Task 5: Build brief, progress, result and local preview screens

**Files:** Create apps/editor/src/StoryCreationScreen.tsx, StoryCreationScreen.test.tsx, StoryCreationScreen.stories.tsx, GenerationResult.tsx and tests; modify WorkspaceScreen.tsx, App.tsx, api.ts, api.test.ts, routing.ts, routing.test.ts.

**Interfaces:** Routes /create and /create/:jobId plus /create/:jobId/preview. Typed client methods mirror generation routes. Result acceptance navigates to existing story editor; normal blank story creation remains.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```tsx
expect(
  screen.getByRole("button", { name: "Create this story" }),
).toBeDisabled();
// Resolve mocked job as ready, then accept twice rapidly.
await user.dblClick(screen.getByRole("button", { name: "Create this story" }));
expect(api.acceptGeneration).toHaveBeenCalledTimes(1);
```

Test missing key, upload rejection, progress, partial failure, retry/cancel, ready preview, acceptance error and success. Reload job URL resumes polling. Preview renders shared StoryViewer and does not create a workspace project. Acceptance preserves previewed candidate digest.

- [ ] Run `yarn test apps/editor/src/StoryCreationScreen.test.tsx apps/editor/src/GenerationResult.test.tsx apps/editor/src/api.test.ts apps/editor/src/routing.test.ts` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```ts
const canAccept = job.stage === "ready" && !accepting;
// Disable acceptance while the request is active; server idempotency remains authoritative.
```

Use shared form/control components. Inputs collect the full brief and classified references; show what material is sent to OpenAI. Provide stage names, retryable error explanations, generated palette/assets/outline, missing-content notes, View as reader, and Create this story. Permit editing the brief and starting a new candidate without modifying earlier accepted projects. Replace the old chapter-bound Studio entry with the new workspace creation entry; remove obsolete hard-coded prototype code only after confirming no imports/tests depend on it. Maintain normal content editing and user-controlled publishing. No AI conversation or existing-project mutation endpoint.

- [ ] Run `yarn test apps/editor/src/StoryCreationScreen.test.tsx apps/editor/src/GenerationResult.test.tsx apps/editor/src/api.test.ts apps/editor/src/routing.test.ts` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `feat: create stories from a brief and approved preview`.

### Task 6: Prove end-to-end generation and document operation

**Files:** Create scripts/smoke-story-generation.ts; update README.md, docs/local-projects.md, docs/publication.md, docs/design/patterns.md, and generation tests.

**Interfaces:** Smoke command uses a disposable workspace, explicit configured models and provider credentials; emits a redacted report with artifact paths, stage outcomes and usage. It never reads real author projects.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```ts
// Integration assertions after candidate acceptance and save/reopen:
expect(imported.chapters.map((c) => c.id)).toEqual(
  candidate.project.chapters.map((c) => c.id),
);
expect(reopened.chapters[0].narrative).toBe(editedNarrative);
expect(publicationErrors).toEqual([]);
```

Run mocked integration on every test suite. Real smoke uses a short fictional illustrative brief, one generated layered scene and one prose chapter; no fabricated factual data. Verify actual image bytes and browser rendering, not just status ready.

- [ ] Run `yarn test apps/local-service/src/generation packages/project-store/src apps/editor/src/StoryCreationScreen.test.tsx` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```ts
// Smoke sequence:
// disposable workspace → real Generate → ready preview → accept → edit → save/reopen
// → build publication → render → verify no AI/network calls from generated scene.
```

Use existing publication builder and offline verifier. Check narrow/reduced-motion behavior and inspect screenshots manually. Report provider access errors as blocked real verification, not as a passing smoke. Explain API key configuration, reference handling, local staging lifecycle, retry behavior, usage charges, and the distinction between candidate acceptance and publishing. Add explicit user-driven discard for unaccepted jobs with contained deletion; accepted project assets remain untouched.

- [ ] Run `yarn test apps/local-service/src/generation packages/project-store/src apps/editor/src/StoryCreationScreen.test.tsx` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `test: verify generated story acceptance and publication`.

## Final verification and handoff

- [ ] Run `yarn typecheck`, `yarn test`, `yarn check:independence`, `yarn check:ui`, `yarn format:check`, `yarn build`, `yarn build:publication`, and `yarn storybook:build`.
- [ ] Run additional publishing/runtime checks specified below. Exercise the user journey in a browser with disposable projects; record actual outcomes.
- [ ] Update maintained domain guidance and Storybook fixtures. Use the PR template and identify checks as passed, failed, or not run with a reason.
- [ ] Push the focused branch and open a PR; attach it to this chat. Check CI and review feedback, fix sound findings, and leave the PR unmerged.

- [ ] Also run `yarn test:publishing:no-git` and `yarn test:offline-runtime`. Run `yarn tsx scripts/smoke-story-generation.ts` only with configured real credentials and record usage. Archive the two supplied feedback ZIPs without modifying their attachment originals after the related PR work is complete; delete recoverable extracted copies and derived frame scratch files.

## Execution evidence — 2026-11-20

Implemented inline in `codex/generated-story-candidates`, stacked on the illustrated-scene and editor-feedback branches. The original task checkboxes describe the proposed sequence, not a claim that each proposed commit or command ran literally.

- The service now owns OpenAI planning/artwork requests, bounded reference preparation, durable checkpoints, cancellation/retry, and isolated candidate assets. Provider responses are validated scene data, never executable content.
- Acceptance imports the exact candidate atomically with a persistent receipt. Integration tests cover repeated/concurrent acceptance, crash recovery, editor changes after acceptance, hidden temporary projects, interrupted jobs, and checkpoint reuse.
- The workspace offers a brief form, generation progress, candidate result/reader preview, explicit acceptance and discard. The old Studio prototype is removed. Browser checks used disposable workspaces and covered generation through acceptance, ordinary editor rendering, 1440px/390px layouts, and reduced motion.
- The explicit mocked smoke completed generation, preview, acceptance twice, edit/save/reopen, and publication. It is not evidence of live OpenAI access. The live smoke stopped before any request because `OPENAI_API_KEY` is absent; actual account/model access and generated artwork quality remain unverified.
- PDF extraction and native image decoding dependencies are included with local-service resources and notices. Service relocation and resource tests pass; signed packaging and installed target-machine generation were not run.
- Reference archives were copied into the ignored `.feedback/archive/` without changing attachment originals. Byte-size-matching extracted copies and derived analysis frames were removed.

Final verification: `yarn test --maxWorkers=2` passed all 159 files / 1,312 tests with local-server access enabled. `yarn typecheck`, `yarn check:ui`, `yarn check:independence`, `yarn build`, `yarn build:publication`, `yarn storybook:build`, and `yarn test:publishing:no-git` (126 tests) passed. Repository-wide `yarn format:check` still reports four untouched baseline files: the Kronebreen GeoJSON, the 2026-10-28 desktop pilot plan, and the two Roadless Rule GeoJSON assets. Changed-file formatting is checked separately.

The final offline browser rerun exposed an existing DeckOverlay lifecycle race: stale attachment state allowed `setProps` after the map lost its style. A failing regression test reproduced it. The fix keys attachment to the actual map, tracks attachment revisions, and refuses updates without a live style. The six overlay tests, typecheck and rebuilt reader passed. `node --import tsx scripts/verify-offline-runtime.ts` then passed against that fresh build with 26 same-origin paths observed (the runtime half of `yarn test:offline-runtime`). The first retry had also reported Chromium insufficient resources; disposable build output was removed before rerunning.
