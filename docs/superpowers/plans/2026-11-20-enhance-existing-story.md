# Existing-story visual enhancement implementation plan

> Execute inline, task by task. User approved execution without another approval gate.

**Goal:** Enhance an existing editable story from Story settings with previewed vector additions and minimal text changes.

**Architecture:** Extend generation jobs with an optional enhancement source snapshot. The provider returns a constrained additive plan; deterministic assembly preserves the original project. Apply runs an optimistic source check inside the store's existing write lock.

**Tech Stack:** TypeScript, Zod, React, existing ChatGPT provider, project store, compiler/viewer, Vitest.

## Global constraints

- No API keys, arbitrary generated scripts, schema replacement, or automatic publication.
- Preserve original chapter IDs/order, sources, metadata and attribution.
- Four existing vector templates; bounded, explained text replacements only.
- Keep filesystem and credentials in the local service; retain capability/origin guards.
- Open the resulting PR ready for review.

## Task 1: Enhancement contracts and deterministic composition

Files: packages/story-schema/src/generation.ts; apps/local-service/src/generation/enhancement.ts and enhancement.test.ts; vector-plan.ts.

- [ ] Add optional job enhancement {projectId, sourceDigest, warnings}; optional plan placement anchors and textEdits. Legacy jobs parse unchanged.
- [ ] Write tests that compose original prose, map, image and data sources with inserted scenes and verify all untouched fields remain equal. Reject missing anchors, duplicate/colliding IDs, non-visual additions, ambiguous edits and oversized changes.
- [ ] Implement `assembleEnhancement(job, source): GenerationCandidate` using cloned source plus anchored new chapters and exact bounded substring edits. Compile before returning and digest the candidate.
- [ ] Validate vector output via a dedicated enhancement schema; never trust project replacements from the model.

## Task 2: Snapshot context, persistence and apply

Files: generation/enhancement-context.ts, jobs.ts, routes.ts; packages/project-store/src/store.ts; tests adjacent.

- [ ] Add explicit POST enhancement route accepting projectId, brief, and bounded map snapshots. Store the parsed project separately from routine job responses.
- [ ] Build bounded context from the source project and local references. Normalize image bytes with existing machinery; read local files through containment checks, with limits. Include map snapshot references and warnings for unavailable content. Never fetch arbitrary original external URLs.
- [ ] Run the existing queued/planning/assembly stages with enhancement context and preserve failure/retry/edit behavior.
- [ ] Map candidate preview assets to original project asset endpoints, keeping connected URLs unchanged.
- [ ] Add `applyEnhancement(id, candidate, original)` in ProjectStore: compare current project with original under the write lock; recognize an already-applied exact candidate on recovery; otherwise reject stale sources. Preserve normal atomic saves/backups.
- [ ] Test source changes, repeated apply, restart recovery, and persistence of original assets.

## Task 3: ChatGPT enhancement plan

Files: generation/chatgpt-provider.ts and tests; vector-plan.ts.

- [ ] Accept optional source project context in provider.plan. Use the enhancement output schema when present, keeping creation unchanged.
- [ ] Prompt explicitly for visual additions and minimal supporting edits only, with factual preservation, anchors, reasons, and untrusted-context handling. Include complete project context within documented bounds plus prepared image/data references.
- [ ] Test structured output selection, preservation instructions, request context, and validation/repair behavior with mock transport.

## Task 4: Story settings and enhancement UI

Files: apps/editor/src/routing.ts, api.ts, App.tsx, StoryCreationScreen.tsx, GenerationResult.tsx and adjacent tests.

- [ ] Add enhancement routes carrying projectId/jobId/preview. Save before entry and capture available map canvases using captureMapSnapshots.
- [ ] Reuse direction/reference/account UI; populate original story title/context without asking authors to repeat content. Label enhancement actions clearly and disclose context coverage.
- [ ] Show insertion positions and exact before/after text changes with reasons. Preview through StoryViewer. Apply only the candidate digest and reopen the same project.
- [ ] Preserve failed-job Edit brief and references; edited enhancements take a fresh source snapshot. Provide return-to-story navigation.
- [ ] Test routing, save-before-entry, failure recovery and apply labels, and preservation of creation behavior.

## Task 5: Verification and delivery

- [ ] Run targeted tests for all changed boundaries, then typecheck/full tests and repository checks/builds where dependencies permit. Record exact environment limitations rather than claiming unrun passes.
- [ ] Update README/local project documentation with enhancement limits and context disclosure.
- [ ] Review the complete diff for asset preservation, concurrency and privacy; commit and push a ready-for-review PR, attach it, and report validation.
