# Continuous Vector Stories Implementation Plan

> For agentic workers: use executing-plans to implement inline, task by task.

**Goal:** Generate story-specific vector artwork that persists across narrative steps, with preservation of existing content and static publication support.

**Architecture:** Store declarative visual sequences referencing existing chapter IDs. Compile them separately into the publication contract and render each through one shared sticky scene component. Extend the current vector renderer rather than introducing executable AI output.

**Tech Stack:** TypeScript, Zod, React, SVG, Vitest, existing ChatGPT provider and local project store.

## Global constraints

- Preserve authored content, stable IDs, attribution, maps, sources, and publishing control.
- No API keys, generated JavaScript, injected markup, or new external runtime dependencies.
- Keep old projects and publications readable; additive fields default to absent/empty.
- Work in an isolated branch from current main and open a ready-for-review PR.
- Use synthetic fixtures only; the author will manually test Ice then Hurricane.

## 1. Define and validate the contracts

Files: `packages/story-schema/src/illustration.ts`, `project.ts`, `publication.ts`, `generation.ts`, and their tests.

- [x] Add tests for legacy documents with no visual sequences and for sequence references that are missing, duplicated, overlapping, out of order, or interrupted by a map chapter.
- [x] Define a visual sequence with stable ID, chapter IDs, step progress intervals, scene, alt text, and caption. Project sequences contain source-facing scene layers; publication sequences contain resolved asset-facing layers.
- [x] Add optional rotation to keyframes with a zero default. Specify transform origin at the center of each layer and finite rotation limits.
- [x] Bound scene layers, geometry bytes, keyframes, and aggregate generated response size. Keep paths subject to the existing command grammar.
- [x] Verify schema round trips and compatibility before committing the contract.

## 2. Compile and export sequences

Files: `packages/publisher/src/compile.ts`, `compileValidation.ts`, their tests, and the archival export implementation discovered by tracing illustrated-chapter export.

- [x] Test deterministic output, retained chapter IDs, source resolution, invalid sequence rejection, and legacy output.
- [x] Compile sequence references and scenes without flattening narrative into generated text.
- [x] Include scene data in build identity and all applicable preflight checks.
- [x] Render readable stills and complete narrative in archival output; retain existing successful publication on failed candidate builds.

## 3. Render continuous scenes

Files: `packages/story-schema/src/sceneFrame.ts`, `packages/viewer/src/chapterBlocks.ts`, `StoryViewer.tsx`, `AtlasStoryViewer.tsx`, `FocusedChapterViewer.tsx`, `IllustratedChapter.tsx`, and `illustrated.css`; create shared sequence renderer and tests.

- [x] Test rotation interpolation, sequence boundaries, and grouping without swallowing or duplicating chapters.
- [x] Extract the existing SVG drawing into a shared renderer receiving a scene and normalized progress. Keep standalone illustrated rendering compatible.
- [x] Implement a sticky viewport scene with HTML narrative steps; compute progress from the nearest scrolling container.
- [x] Integrate all reader themes and focused previews. End sequences at data/media chapters and resume through subsequent compositions.
- [x] Cover narrow screens, keyboard access, readable text, resize, reduced motion, print, and snapshot capture.

## 4. Replace the generation constraint

Files: `apps/local-service/src/generation/vector-plan.ts`, `chatgpt-provider.ts`, `enhancement.ts`, `candidate.ts`, `jobs.ts`, and their tests.

- [x] Test custom geometry output, invalid geometry repair, source-preserving sequence assembly, and old candidate acceptance.
- [x] Replace the provider's four-template response restriction with bounded declarative scenes and sequences. Retain legacy recipe parsing where persisted data or compatibility tests require it.
- [x] Instruct the provider to create subject-specific compositions and meaningful motion; separate production rationale from reader-facing captions.
- [x] Validate sequence anchors against the source snapshot and preserve original content and existing exact-match text-edit constraints.
- [x] Include sequences in candidate digests, preview, stale-source checks, and atomic apply recovery.
- [x] Keep generation failures editable and explicit; do not substitute stock diagrams when custom output fails.

## 5. Author review and editing

Files: `apps/editor/src/GenerationResult.tsx`, `IllustrationInspector.tsx`, relevant chapter/settings controls, and Storybook fixtures.

- [x] Show which existing chapters share a scene and expose proposed text edits separately.
- [x] Allow inspection of a sequence's steps, composition, and motion with the existing preview controls.
- [x] Preserve normal content editing by referencing chapter IDs rather than storing duplicate prose.
- [x] Cover loading, partial, failure, disabled, focus, narrow, and reduced-motion states with stable fixtures.

## 6. Verify complete flows and document limits

- [x] Add distinct synthetic glacier and hurricane scenes. Inspect beginning, middle, and ending scroll states in desktop and narrow browser previews.
- [x] Exercise new-story generation and enhancement using controlled provider output, then reload, edit content, apply, compile, and render the publication.
- [x] Run the required checks and report limitations. Offline browser verification failed with CDP timeout/connection closure; full-repository formatting flags four unchanged baseline files. Changed-file formatting, typecheck, tests, builds, publication, Storybook and publishing-no-git were checked.
- [x] Update README and relevant design/publication guidance to describe custom sequences and compatibility behavior.
- [x] Open ready-for-review PR #45, inspect code review findings, and provide manual testing steps for Ice followed by Hurricane.

## Acceptance checklist

- [x] Glacier and hurricane imagery are recognizable without relying on their labels.
- [x] The scenes do not reuse the same geometry with different colors.
- [x] Scroll advances a visual explanation and narrative over one continuous scene.
- [x] Existing maps/data remain functional and original text remains editable.
- [x] Captions contain reader-facing information rather than instructions to the renderer.
- [x] Preview and publication behave consistently, including reduced motion and narrow layouts.
- [ ] Author manual polish assessment: Ice followed by Hurricane. Synthetic fixture checks are not evidence of live AI output quality.

## Execution notes

- Added optional `visualSequences` to the v3 contracts without changing legacy scenes.
- Sequences deliberately use vector-only scenes, so source/asset resolution is unnecessary for these new fields; existing illustrated chapters retain normal image resolution.
- Added an authored focal point for full-height responsive composition, discovered during narrow browser verification.
- Normal content edits retain scene references; structural chapter edits split scene ranges and resample boundary keyframes.
- New generation requires custom scene output and substantive vector motion when animation is requested. Legacy recipe parsing remains for persisted candidates and compatibility.
- Review regressions cover chapter readiness/navigation markers in scroll, focused and still modes, and preservation of original illustrated artwork/captions in sequences and archival exports. Both initial review findings were reproduced and corrected; 157 relevant tests and typecheck passed afterward.
- Follow-up review fixes preserve complete sequences in focused fallback previews, keep invalid description drafts out of the saved story with inline feedback, and share progress tolerance between validation and reconciliation. Added reorder, middle-deletion and map-boundary regressions.
- The AI-facing schema converts disjoint path/text unions to `anyOf`, matching the provider subset; strict-schema regression coverage guards this conversion.
- Final review corrections bake displayed motion into split tracks (including zero/partial strength) and reject enhancement insertions inside existing sequences with an actionable repair message. Regression tests cover both cases.
- No live ChatGPT generation or real author project mutations were performed. The separate unavailable-data warning from the hurricane recording has not been diagnosed by this visual-rendering work.
