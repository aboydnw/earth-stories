# AI enhancement usability and visual quality implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, task-by-task. Steps use checkbox (`-`) syntax for tracking.

**Status:** Implemented on `codex/enhancement-polish`; pending PR review and merge. The user approved execution as one ready-for-review PR. The original task descriptions below record the approved scope; current implementation and validation are summarized here.

## Execution record

- Implemented the unified enhancement form, reusable editor navigation, compact account/model controls, Preview-first review, explicit text-change disclosure, and readable content-sized actions.
- Added absolute-coordinate generation guidance, generation-only visibility diagnostics, thematic editorial art direction, responsive crop sharing, and scene pacing that preserves print/static behavior.
- Replaced the visible source-story preview with sequential off-screen focused map capture, including readiness, cancellation and cleanup. The existing service coverage notes report missing chapter previews; no second coverage protocol was necessary.
- Added annotated links and editable use/notes, bounded HTML extraction, static browser appearance capture, and explicit text-only/partial capture limitations. Root fetches and browser resources use the existing DNS-pinned public-network boundary; browser direct networking, scripts, frames and downloads are blocked.
- Preserved the existing preview, explicit approval, stale-source checks, ordinary editing and publishing boundaries. No API-key path was introduced.
- Reproduced the recorded regions failure: the connected `context/admin1.pmtiles` archive returns 404; the service reports this as 502. No substitute data or changed author source was introduced.

Validation: typecheck, 1,469 unit/integration tests (184 files), UI/independence checks, editor/reader builds, publication fixture, Storybook, publishing without git and offline browser proof pass. Desktop/390px browser checks cover readable review actions, keyboard focus, expanded text diffs and moving Ice/Hurricane fixtures. An isolated webpage capture blocked a loopback image request (zero requests reached the private listener). Repository formatting has pre-existing failures in two roadless-rule GeoJSON assets, the ice-front GeoJSON asset and the October 28 desktop pilot plan; changed files are checked separately. Final counts and live-generation outcomes are recorded in the PR.

Review follow-up: persisted webpage inspection notes before enhancement assembly so Apply rebuilds the same approved digest, including after service restart. Explicit URL parsing now keeps filenames such as `figure.png` in notes. Live validation also exposed an existing rejected stream-cleanup promise on timeout; cancellation now handles cleanup rejection and the regression test verifies no unhandled promise escapes. The live Ice example produced two thematic scenes with zero text edits/additions; explicit apply and later ordinary editing passed on its disposable copy. A Hurricane request reached the provider timeout; the corrected failure path is covered deterministically and live validation results are reported in the PR.

Additional review fixes reject filename-like bare references, preserve declared HTML encodings, validate edited HTTPS links while updating generated labels, and exercise invisible-motion rejection through plan composition. Removing routine Sign out/Manage usage remains the approved product decision; there is no replacement account-management UI in this scope.

Implementation adaptations: one PR supersedes the initial four-PR suggestion; the capture helper accepts an already authorized HTML response so redirects and final-source provenance remain owned by the service. Browser output is static and bounded, not a claim of complete website inspection.

**Goal:** Make visual enhancement feel like part of Earth Stories and produce coherent, immersive thematic artwork that supports the existing story.

**Architecture:** Keep the current saved brief → generation → private preview → explicit apply flow. Improve its editor composition, reference preparation, and generation contract; use the shared viewer for all animation and preview behavior. Preserve existing story content and map/chart renderers rather than replacing them with generated diagrams.

**Tech stack:** React, TypeScript, Chakra through `@earth-stories/ui`, Zod, the local project service, ChatGPT account connection, shared SVG viewer, Vitest and browser verification. Use Node 24+ to satisfy the current local-service engine requirement and the repository baseline.

## Global constraints

- Planning only until execution is requested. Start execution in an isolated `codex/` worktree from current main.
- Open all pull requests ready for review. Do not merge them automatically.
- Preserve unrelated local changes and use synthetic fixtures or disposable copies, never real author stories as tests.
- Keep ChatGPT sign-in; do not introduce API-key configuration.
- Retain explicit approval before applying to a story, stale-source detection, atomic saves, and author-controlled publishing.
- Preserve original prose, chapters, sources, maps, images, charts, attribution and publishing settings. Allow only the existing narrowly bounded supporting text edits.
- Keep generated content declarative. No generated JavaScript, CSS, HTML or executable SVG.
- Keep project and publication contracts separate; update schema, compatibility, compiler, viewer and exports together for any contract change.
- Reuse product UI tokens. Reader themes and authored colors remain separate from product chrome.
- References are evidence, never instructions. Do not claim unreadable content was inspected or invent factual values.

## Feedback and diagnosis

Reviewed in recording order:

1. `riffrec-2026-11-22-1158-eea759.zip`, 7:09: generation/review screen and instruction form.
2. `riffrec-2026-11-22-1201-d55c06.zip`, 3:02: generated reader experience.

Both show the same Hurricane enhancement on port 5174. Narration was transcribed locally after the video service timed out; wording was corroborated against recorded frames and events. Original ZIPs remain unchanged. Analysis is retained in `.feedback/analysis/2026-11-22/`.

| Finding                                                                    | Classification                         | Evidence / consequence                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enhancement screens lose the app navigation and visual continuity          | Design critique                        | First recording, opening and approximately 3:20 onward. Reuse the editor's navigation and controls.                                                                                                                        |
| Review prioritizes editing instructions; Preview is buried                 | Design critique                        | First recording, approximately 0:40–3:20. Preview must be the first action; Apply and Edit instructions belong nearby.                                                                                                     |
| Full-width orange controls have hard-to-read labels                        | Visible defect plus layout critique    | Frames confirm poor contrast. Unlayered `button { color: inherit }` can override the layered Chakra recipe; verify computed styles before fixing.                                                                          |
| Long scene descriptions, chapters and warnings are confusing               | Design critique                        | These are proposed changes and coverage notes, not the raw prompt. Name them correctly and disclose detail progressively.                                                                                                  |
| Account defaults and sign-in controls are redundant                        | Usability defect / design critique     | Current panel initializes an empty selection even with an active account; model loading selects the first model. Preserve valid selections on edit/reopen.                                                                 |
| Two direction fields seem redundant                                        | Design critique                        | First recording, approximately 5:20–5:50. Recommend one instruction field for enhancement.                                                                                                                                 |
| Links should accept explanations and ordinary webpages                     | Capability request                     | First recording, approximately 5:50–6:40. Current parser requires bare HTTPS URLs and only prepares supported file types. No reference submission occurs in the recording, so this is not evidence of a failed generation. |
| Visible original-story preview is unwanted clutter                         | Design critique                        | First recording, end. Remove it from the user flow without removing AI context collection.                                                                                                                                 |
| Opening hurricane is an improvement; closing three-dot diagram is unwanted | Product direction                      | Second recording, approximately 0:33–3:00. Target thematic page artwork, atmosphere and meaningful movement; do not generate unsolicited explanatory diagrams.                                                             |
| Hurricane moves to the wrong place / final spiral is absent                | Confirmed generation-contract mismatch | Saved candidate uses apparent position offsets; `sceneFrame` interprets them as absolute coordinates. The final vortex has negative displayed coordinates throughout.                                                      |
| Requested animation pacing is ignored                                      | Code-confirmed defect                  | `VisualSequence` ignores `scene.scrollLength`; this candidate requests 2.8 and 1.3, while narrative steps have a fixed minimum height.                                                                                     |
| Guided-map previews were not inspected                                     | Confirmed capture mismatch             | Snapshot utility expects standalone map chapter containers; grouped scrolly chapters have a shared sibling map. Fixing selectors alone would capture the wrong chapter state.                                              |
| Regions source returned HTTP 502                                           | Separate reliability issue             | First recording at 3:23.7. Upstream cause remains unconfirmed and must not be conflated with capture or illustration defects.                                                                                              |

No finding requires blaming an unexpected user action. The candidate retains all seven original chapters. The two aborted requests were followed by successful matching fetches; do not treat those as generation failures.

## Recommended product decisions

- **Review:** show “Your enhanced story is ready” followed by **Preview story**, **Apply to story**, and **Edit instructions**. Preview is primary; Apply and Edit have equal secondary prominence. Show a short change summary, then collapsed details.
- **Form:** one **What would you like to add or change visually?** field, references, compact account/model controls, and a right-aligned **Generate visual enhancements** button. Example guidance may mention atmosphere, colors, illustration style and scroll motion.
- **Account:** default to the active account, otherwise the first saved account. Provide **Add account** separately. Remove routine Sign out and Manage usage controls from this task screen; retain actionable recovery for expired sign-in or usage limits. An account-management screen is deferred.
- **Actions:** Edit instructions reuses the saved brief; Cancel editing returns to the existing result. Remove redundant “Start a fresh enhancement” from the main action cluster. Put **Discard this result** in a secondary location, explain that it leaves the story unchanged, and retain the existing safe discard behavior.
- **Details:** distinguish **Your instructions**, **Proposed changes**, **Original text changes**, **Sources used and unavailable**, and **Generation details**. Show important limitations and whether text changed in the summary; expanded detail contains full lists/diffs. Approval must not conceal substantive text changes.
- **Preview:** keep opening in a new tab. Header reads **Story preview · not applied or published**; remove “Back to candidate.” Keep the story's own title/header.
- **Visual direction:** prioritize a recognizable thematic subject and recurring visual language. Existing maps and charts remain authoritative. Do not decorate credits with new charts or invent numeric/time labels. A few purposeful illustrations are preferable to filling every chapter.
- **Scope boundary:** this pass does not require vector scenes to span interactive map/chart chapters. Improve art, pacing and placement using existing sequences and, where useful, approved illustration interludes. A generalized overlay across every chapter type is separate future work.

## Delivery sequence

The user requested one new ready-for-review PR covering editor flow, motion and thematic generation, story context, and annotated webpage references. This supersedes the original suggestions below to split delivery.

### Task 1: Restore navigation and make review action-led

**Files:** modify `apps/editor/src/App.tsx`, `StoryCreationScreen.tsx`, `GenerationResult.tsx`, `storyCreation.css`, and the applicable rule in `editor.css`; inspect `packages/ui/src/theme.ts` and `index.tsx` before changing shared styles. Create `apps/editor/src/StoryCreationScreen.test.tsx`, `GenerationResult.test.tsx`, and `GenerationResult.stories.tsx`. Update `docs/design/patterns.md`.

**Interfaces:** retain `GenerationResult`'s existing job/apply props; add `onEditInstructions: () => void`. The result owns the ready-state action group, avoiding duplicate Apply/Edit controls in its parent. Reuse the current app navigation implementation; do not mount a second story editor to obtain its header.

- Add ready/partial/error/stale-result fixtures and tests showing Preview first, followed by Apply and Edit; check disabled Apply during acceptance, and original-text-change visibility.
- Run `yarn vitest run apps/editor/src/GenerationResult.test.tsx apps/editor/src/StoryCreationScreen.test.tsx` and confirm the new expectations fail before the UI changes.
- Recompose the ready state using this action contract:

  ```tsx
  <div className="story-creation__actions" aria-label="Review enhanced story">
    <a href={previewHref} target="_blank" rel="noreferrer">
      Preview story
    </a>
    <ActionButton variant="surface" disabled={accepting} onClick={onAccept}>
      Apply to story
    </ActionButton>
    <ActionButton variant="surface" onClick={onEditInstructions}>
      Edit instructions
    </ActionButton>
  </div>
  ```

  `previewHref` is the existing create/enhance preview route. Style the anchor through the existing primary-action contract, with visible focus and adequate contrast; do not nest an interactive button inside it. Keep content-sized controls on desktop and sensible wrapping on narrow screens.

- Add correctly named disclosures and a concise summary. Remove candidate terminology from visible task copy, simplify discard/restart actions, and use the requested preview header.
- Inspect computed button colors in an actual browser; scope/remove the global color override if confirmed, then check legacy editor buttons and all shared button states.
- Run focused tests plus Storybook/browser checks at 1440px and 390px, including keyboard navigation. Commit the navigation/review change separately from generation behavior.

### Task 2: Simplify instructions and account configuration

**Files:** modify `StoryCreationScreen.tsx`, `ChatGPTConnectionPanel.tsx`, and `storyCreation.css`; create `apps/editor/src/enhancementDirections.ts`, `enhancementDirections.test.ts`, and `ChatGPTConnectionPanel.test.tsx`; extend the screen tests from Task 1.

**Interfaces:** add `enhancementDirections(brief: Pick<StoryBrief, "narrative" | "visualDirection">): string`. Add optional `selectedModel?: string` to `ChatGPTConnectionPanel`. Preserve `onReady(ready, model)` and existing connection endpoints.

- Test reopening a legacy two-field brief, cancel/re-edit, active-account initialization, first-saved-account fallback, unavailable account/model, adding an account, and transient connection failure.
- Run `yarn vitest run apps/editor/src/enhancementDirections.test.ts apps/editor/src/ChatGPTConnectionPanel.test.tsx` and confirm failures.
- Preserve both legacy fields when composing the new instruction text:

  ```ts
  export function enhancementDirections(
    brief: Pick<StoryBrief, "narrative" | "visualDirection">,
  ): string {
    return [brief.narrative.trim(), brief.visualDirection.trim()]
      .filter(Boolean)
      .join("\n\n");
  }
  ```

  Only combine once when loading an enhancement brief. On submission store the unified text in `visualDirection` and clear the enhancement-only `narrative` input; expand the bounded visual-direction capacity to accommodate the previous combined limits (60,002 characters), updating shared schema and recovery tests. New-story creation keeps its distinct factual and visual fields. Never silently truncate an old brief.

- Move account/model controls beneath references, use a compact responsive row, select the active/first saved account, and retain a saved model if still available. Selecting an existing account must activate it through the existing connection flow; changing a dropdown alone must not imply a switch succeeded. Notify Generate readiness only after the selected account is active and its model list is valid.
- Replace routine reconnection with Add account and conditional Reconnect. Remove Sign out/Manage usage from normal task controls; show relevant recovery only in error states. Do not invent allowance totals.
- Verify tests and form loading/error/focus/narrow states; commit with Task 1's PR.

### Task 3: Make motion coordinates and pacing reliable

**Files:** modify `apps/local-service/src/generation/chatgpt-provider.ts`, `vector-plan.ts`, `custom-plan.test.ts`, `chatgpt-provider.test.ts`; `packages/viewer/src/VisualSequence.tsx`, `visualSequence.css`, `VisualSequence.test.tsx`; extend `packages/story-schema/src/illustration.test.ts` and the existing visual Storybook fixtures. Create `apps/local-service/src/generation/scene-quality.ts` and `scene-quality.test.ts`.

**Interfaces:** preserve absolute keyframe positions in the public scene contract. Add `inspectSceneQuality(scene: SceneDefinition): { code: string; layerId?: string; message: string }[]` for candidate-only diagnostics. It must not reject old stored projects or reinterpret their positions.

- Add a regression fixture derived from the failure, without copying the author's story: a moving subject with origin `(0.8, 0.56)` and mistaken negative keyframes, plus a valid counterpart using absolute positions. Test clipping/cropping, reduced motion, static capture, nested scrollports, and shorter/longer requested scroll lengths.
- Run `yarn vitest run apps/local-service/src/generation/scene-quality.test.ts packages/viewer/src/VisualSequence.test.tsx` and confirm the new quality/pacing cases fail.
- Specify the generation coordinate contract explicitly, including this example:

  ```text
  Keyframe x/y replace layer x/y; they are absolute normalized scene positions,
  not offsets. A subject at (0.8, 0.56) moving left by 0.2 ends at (0.6, 0.56),
  not (-0.2, 0). Account for scale, rotation, clipping and responsive cropping.
  ```

  Add descriptions/examples to the provider schema and prompt. Do not globally add layer origins to existing keyframes or automatically repair saved author content by guessing intent.

- Sample generated scenes at 0, .25, .5, .75 and 1 with the real `sceneFrame` and representative desktop/narrow viewports. Compute conservative transformed layer bounds, crop intersection and opacity; flag wholly invisible moving geometry and scenes whose only substantial movement is invisible. Allow intentional entrances/exits. Use deterministic fatal findings in the existing single repair attempt; surface uncertain composition findings as review notes, not claims of guaranteed art quality.
- Honor `scrollLength` as minimum scene scroll travel, distributed by step interval, while allowing narrative overflow. Preserve default behavior for old sequences where feasible; make progress reach both endpoints and verify no text clipping. Do not let additional blank scrolling conceal missing visual motion.
- Verify interpolation/unit tests and real browser start/middle/end frames in editor preview, new-tab preview and compiled publication. Commit separately from prompt/art-direction changes for clear review.

### Task 4: Generate thematic artwork rather than unsolicited diagrams

**Files:** modify `chatgpt-provider.ts`, `vector-plan.ts`, `custom-plan.test.ts`; create `apps/local-service/src/generation/enhancement-direction.ts` and `enhancement-direction.test.ts`; extend `apps/editor/src/visualSequenceFixtures.ts` and `VisualSequence.stories.tsx`; update `docs/design/patterns.md`.

**Interfaces:** export `enhancementArtDirection: string` from the new prompt module. Retain the current output schema and safe assembly path. Any future addition of semantic roles to persisted scenes must be separately justified; do not add it merely to implement prompt copy.

- Add provider payload tests that verify the thematic instruction and coordinate examples are sent in enhancement mode, while source preservation and untrusted-reference instructions remain present.
- Use this core prompt direction:

  ```text
  Act as an editorial illustrator designing an immersive story webpage.
  Read the existing narrative, images, maps and data to identify its thematic
  subject and visual arc. Create original supporting artwork, atmosphere and
  meaningful scroll movement. Use a coherent motif and restrained palette.
  Do not add explanatory charts, timelines, numeric labels or methodological
  diagrams unless the author explicitly requests them. Existing data displays
  already do that work. Do not embellish credits merely because they are prose.
  Preserve the story's facts and wording. Prefer fewer purposeful visual moments.
  ```

- Remove blanket pressure to populate every available prose anchor. Permit an illustration interlude only when it serves a specific visual transition; preserve interactive map/chart chapters and existing scenes.
- Review a Hurricane fixture for recognizable cloud bands/eye, visible motion, legible text and no unsolicited three-dot diagram. Review an Ice fixture for distinct ice/terrain/water geometry, not the same composition with new labels. Use visual review rather than brittle assertions on exact model prose.
- After the deterministic tests pass, perform one deliberate live generation per fixture during authorized execution, with bounded repair and clear usage reporting. Compare against the brief; do not claim schema-valid output is necessarily polished. Include this task with the motion PR.

### Task 5: Gather story context without showing the entire story in the form

**Files:** modify `apps/editor/src/StoryCreationScreen.tsx`, `captureSnapshots.ts`; create `apps/editor/src/EnhancementContextCapture.tsx` and its test; inspect `packages/viewer/src/FocusedChapterViewer.tsx`, `ScrollytellingBlock.tsx`, and `MapChapter.tsx`; extend `apps/local-service/src/generation/enhancement-context.test.ts` and `enhancement-jobs.test.ts`.

**Interfaces:** `EnhancementContextCapture` takes a compiled manifest and a capture request, and reports `{ maps: Record<string, string>; unavailable: { chapterId: string; reason: string }[] }`. Mount only during preparation, in a fixed-size off-screen, inert capture host; unmount and release map resources after success, cancellation or failure. Do not use `display:none` for a canvas that needs measurable dimensions.

- Add fixtures with four guided-map chapters using distinct cameras/times, a delayed map, failed optional overlay, tainted canvas and cancellation. Test each screenshot's chapter identity and correct state rather than duplicating a single shared map snapshot.
- Run focused capture/context tests before changes to establish the failures.
- Render each supported chapter through the shared focused viewer at its actual camera/time. Wait for the matching map readiness signal with a bounded timeout. Capture sequentially or with a small explicit concurrency bound; preserve the current 12-map input limit and attribution.
- Remove the visible Original story section. Show a short “Preparing story context…” state near Generate, then useful chapter-specific limits if capture was incomplete. Continue with available context when appropriate, without claiming complete inspection.
- Investigate the recorded regions 502 independently using the source configuration and existing remote-fetch path. Fix a reproducible local defect if found; otherwise report the specific unavailable source and retain a working partial map where supported. Do not fabricate substitute geography or silently drop attribution.
- Verify context capture, generation, preview, apply and later ordinary editing on disposable story copies; commit/open the context PR with any remaining external-data limitation stated.

### Task 6: Support annotated links and webpage references

**Files:** modify `apps/editor/src/reference-links.ts`, `reference-links.test.ts`, `StoryCreationScreen.tsx`; `packages/story-schema/src/generation.ts`; `apps/local-service/src/generation/reference-inputs.ts`, `reference-inputs.test.ts`; create `apps/local-service/src/generation/webpage-reference.ts` and its test. Reuse `packages/publisher/src/remote-fetch.ts` and `remote-url.ts` for network policy.

**Interfaces:** extend URL reference input with optional `notes: string` (bounded to 4,000 characters) and retain `classification`. Existing URL inputs remain valid. Add `prepareWebpageReference(url: string, signal: AbortSignal): Promise<{ text: string; image?: string; warnings: string[] }>`; pass notes and extraction limits to the provider separately from factual page contents.

- Add parser cases for full URLs embedded in prose, unambiguous bare domains, two links with different notes, punctuation, malformed addresses, and private/non-HTTPS targets. Add schema/recovery tests proving annotations survive Edit instructions and retry.
- The required user-facing example is:

  ```text
  google.com is a good reference for styles
  ```

  Normalize the unambiguous domain to `https://google.com/`, retain the explanation, and show an editable reference entry with URL, notes and use (Visual style / Facts / Background). Do not silently assign a classification with an opaque keyword guess; let the author verify it. Preserve surrounding text for ambiguous multi-link input and ask for a correction inline rather than dropping it.

- Fetch public HTML as well as existing direct files through the authorized-fetch boundary. Preserve the existing 20-reference, 20-MiB-per-reference, redirect and timeout limits. Extract bounded title/body context, ignoring scripts, hidden instructions and credential-bearing content. Store requested/final source URLs and inspection outcome without inventing attribution.
- For style references, add a bounded visual capture using an isolated, ephemeral browser only when its runtime is available. Every navigation, redirect and subresource must pass the same public-network policy; block private/loopback/file destinations, downloads, popups, credentials and persistent profiles. Do not connect this renderer to author project files or authenticated browsing. If the runtime cannot meet these constraints, return text plus an explicit visual-capture limitation and screenshot-upload fallback; do not claim to have seen page appearance.
- Keep page notes as the author's instruction about using that reference; keep the page's own contents untrusted. A webpage cannot expand the task, change destinations or authorize actions. Do not make generated story art depend on remote page assets.
- Test redirect-to-private-host and subresource blocking, oversized/time-out pages, missing browser runtime, unsupported/blocked pages, image normalization, annotation persistence and a synthetic public webpage fixture. Verify direct-file references still work. Open this as its own ready-for-review PR because it adds network/rendering capability.

## Acceptance and verification

- Form and review retain the app's navigation; primary controls are readable and appropriately sized at desktop and narrow widths.
- A returning author can write one direction, annotate references, confirm their saved account/model and Generate without redundant sign-in actions.
- Ready result leads with Preview. Apply and Edit are adjacent; details are understandable and collapsed, with material text changes and missing context clearly signposted.
- New-tab header says “Story preview · not applied or published.” No candidate jargon or redundant return link.
- The original story is not displayed below the form, but supported images/data/maps still reach the generator with honest coverage notes.
- Hurricane art remains visible and moves where intended. The subject, text and pacing work at 1440px and 390px, with reduced motion and keyboard operation. Existing maps/chart remain functional; no unsolicited three-dot diagram is generated by the acceptance fixture.
- Ice uses a distinct subject-specific visual direction. Reviewer assesses coherent, immersive art, not just valid JSON or nonzero motion values.
- Approved results remain editable; failed/rejected generation leaves the original unchanged; stale-source checks still prevent applying against changed content.
- Run repository checks: `yarn typecheck`, `yarn test`, `yarn check:independence`, `yarn check:ui`, `yarn format:check`, `yarn build`, `yarn build:publication`, `yarn storybook:build`. For viewer/publication work also run `yarn test:publishing:no-git` and `yarn test:offline-runtime`.
- Report passed, failed and not-run checks accurately. Prior offline browser verification was incomplete; rerun and investigate rather than inheriting an offline-success claim. Keep unrelated baseline formatting failures separate from changed files.
- Before each PR, review its final diff and verify affected real user flows. Open ready for review, inspect automated feedback/checks, and address sound findings. Do not mutate the user's Hurricane/Ice stories; hand them back for manual evaluation after merge.

## Explicitly deferred

Full account management, version-history UI, conversational iteration, arbitrary generated code, new image-generation providers, wholesale reader-theme redesign, and a universal animated overlay across interactive chapter types. None is needed to fix the recorded interaction and visual-quality issues.
