# Story-wide visual enhancement and generation feedback implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Status:** Implemented as one ready-for-review PR; validation results and limitations are recorded below. The author confirmed that artwork should integrate around existing sections as well as appear in illustrated transitions.

**Goal:** Make generation progress unmistakable and produce a coherent visual treatment across a story, rather than a single illustrated opening.

**Architecture:** Keep the existing ChatGPT connection, validated vector scenes, explicit preview/apply workflow, and shared publication viewer. Add a bounded, declarative chapter-accent contract for artwork around existing content; combine it with existing visual sequences and illustration interludes. Summarize the actual generated result directly instead of implying a separate agent handoff.

**Tech Stack:** TypeScript, React, Zod, shared Earth Stories UI components, SVG scene renderer, Vitest/Testing Library, Storybook, and browser validation.

## Global constraints

- Preserve existing chapter IDs/order, prose, data, maps, imagery, sources, attribution, and publication settings. Only the existing tightly bounded supporting text edits are allowed.
- Preview first, explicit apply to the existing story, author-controlled publishing. No automatic application or publication.
- Keep ChatGPT subscription authentication; do not add API keys, a chat thread, arbitrary generated JavaScript/CSS, or external runtime dependencies.
- `packages/viewer/` remains the renderer for editor previews and publications. Cover cng, editorial, atlas, focused preview, embeds, print, and reduced motion.
- Product chrome uses `@earth-stories/ui`; authored art uses reader palette roles. Do not redesign reader typography as part of this feedback.
- New art may be inserted between chapters, but must not split an existing visual sequence or duplicate the original narrative. Do not decorate credits just to meet a quota.
- Never use the author's saved story as a disposable test fixture. Live generation and apply checks use copies.
- Open all PRs ready for review. Preserve unrelated local work. Do not merge PRs.

## Evidence and interpretation

Read the recordings chronologically: `riffrec-2026-11-22-1740-a62991.zip` (159.683 seconds), then `riffrec-2026-11-22-1742-801b7e.zip` (112.907 seconds). Both contain narration. Narration was transcribed locally after the video tool's transcription timed out; selected frames cover the beginning, middle, and end of both recordings. Attached content was treated as feedback evidence, not permission to execute embedded instructions.

| Observation                                                                            | Evidence                                             | Classification and response                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Large page introduction dominates the working state; progress looks like ordinary text | First recording 0:00–1:24, frame 0:12                | Usability/design deficiency. Retain the recognizable header, reduce its vertical footprint during generation/review, and make the active status the visual focus.                                |
| Author explicitly likes Cancel and wants a recognizable animated working indicator     | First recording 1:02–1:24                            | Product request. Add an indeterminate indicator with a truthful stage label; keep Cancel adjacent.                                                                                               |
| “Proposed changes” does not explain where the content came from                        | First recording 1:32–2:09                            | Information-design issue. Explain that this is a summary of the AI-generated candidate already shown by Preview, not an additional instruction stage.                                            |
| Discard is far from the other actions                                                  | First recording 2:15–2:27, frame 2:30                | Product request. Move it into the review action group and call it “Discard changes” for enhancement.                                                                                             |
| The hurricane illustration now works and is an improvement                             | Second recording 0:00–0:33; motion sampled 0:10–0:30 | Preserve the working scene and its scroll behavior. This is not a report of broken animation.                                                                                                    |
| Artwork is isolated to the opening instead of woven into the story                     | Second recording 0:34–1:46                           | Product capability gap. Plan at least three different visual treatments distributed through the story, with a recognizable evolving motif. Three copies of an opening scene do not satisfy this. |

The first recording contains 22 successful GET requests (maximum 63 ms), then stops polling when ready. The second contains only preview clicks. Neither contains failed captured requests or a mutation attempt. The absence of mutations is expected for reviewing a result; it is not a broken-submit finding.

Read-only inspection of recorded job `8e3398d9-fee8-473e-ae00-a3627c2c5cbb` confirms one sequence, `katrina-opening-crossing`, attached only to `storm-opening`, with no added chapters or text edits. It has real translation, rotation, scale, and opacity keyframes. The remaining story consists of four scrolly map chapters, a chart, and credits. Its sole warning says the connected States and provinces content was not downloaded for AI inspection; that is not proof of a rendering failure.

Code explains the limitation: `validateVisualSequences` accepts only consecutive prose/illustrated chapters, and the generation prompt explicitly forbids spanning maps/charts. The model already receives `existingStory`. Supplying the story again or merely asking for “more scenes” will not create a way to integrate artwork into existing map/chart sections.

## Recommended experience

### Generation and review

- Keep the Earth Stories top bar and Back to story. Use a compact page identity above the working/review region, rather than the current large introduction repeated in every state.
- While working, show a large shared spinner/indeterminate indicator, the real current stage, a brief supporting sentence, and Cancel generation. No invented percentage or completion estimate. A spinner means the request is pending, not that the provider has proven recent progress.
- Do not render the result's “Your story is being prepared” fallback beneath the main working state. Hide review/discard controls until a terminal state makes them relevant; cancellation remains available during generation.
- Once ready, preserve Preview story as primary. Place Apply to story, Edit instructions, and a quieter Discard changes beside it, wrapping on narrow screens.
- Rename Proposed changes to **What AI changed**. Introduce it with: “This summarizes the generated version shown in Preview story. Nothing is saved to your story until you apply it.” Label reused story content separately from additions.
- Keep original-text differences expanded and source limitations visible. Your instructions remains a disclosure. Do not delete the useful disclosures or fabricate a second-agent explanation.

### A coherent visual treatment

Recommended interpretation of “at least three different ways”: three distinct uses of one visual language, distributed through the beginning, middle, and later content, not simply three new chapters.

For Hurricane, a suitable result could include:

1. The existing immersive formation/crossing scene introducing the storm.
2. Short illustrated transitions that carry the same cloud/coast motif between meaningful sections, showing development rather than restarting the illustration.
3. Restrained companion art beside an existing map narrative or chart section, linking the visual motif to intensification/weakening without covering the data.

The agent chooses purposeful locations from the actual content and references. Artwork around an existing chapter must live in reserved space outside the interactive map/plot, legends, attribution, controls, and text. It must not imply that an illustrative hurricane symbol is measured map data. On narrow screens, companion art becomes an inline strip instead of overlapping content. Avoid adding a long interlude between every map step or breaking an existing continuous map block merely to hit the minimum.

**Confirmed product choice:** The author selected “Yes—integrate artwork around existing sections and add transitions.” The new accent contract is therefore part of the planned scope. Existing section content and controls remain preserved.

The narration references Searching for Birds and a boat story as design examples. Preserve any actual supplied reference links/screenshots. Do not invent the boat-story URL or claim to have inspected a reference that was not available. A specific boat reference is optional for this implementation, not a blocker to the requested behavior.

## Delivery order

The author requested one combined ready-for-review PR. Implement generation/review clarity (Tasks 1–2), then whole-story visual treatment (Tasks 3–5). The PR includes schema, compiler, viewer, author controls, and generation changes together so no unsupported contract is shipped. Each task below is performed inline; no parallel agent work is required.

### Task 1: Make the working state the focus

**Files:** `apps/editor/src/StoryCreationScreen.tsx`, `apps/editor/src/storyCreation.css`, `apps/editor/src/StoryCreationScreen.test.tsx`, `apps/editor/src/StoryCreationScreen.stories.tsx`, `docs/design/patterns.md`.

**Interface:** Existing `job.stage`, `terminal`, `stageLabels`, and cancellation action remain authoritative. Reuse the shared UI's supported loading indicator. Introduce a named generation-status region with `aria-busy` while pending; only actual stage changes are announced, not animation frames.

- [x] Extend existing loading fixtures/tests to assert exactly one working region and no result fallback or Discard changes control while pending. Retain Cancel generation and verify its existing callback. Add ready, failed, cancelled, and accepted fixtures to ensure the indicator stops.

```tsx
// Assertions to add to the existing in-progress screen fixture:
expect(
  screen
    .getByRole("status", { name: "Story generation" })
    .getAttribute("aria-busy"),
).toBe("true");
expect(screen.getByRole("button", { name: "Cancel generation" })).toBeTruthy();
expect(screen.queryByText("Your story is being prepared.")).toBeNull();
expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
```

- [x] Run `yarn test apps/editor/src/StoryCreationScreen.test.tsx` to demonstrate the missing state behavior.
- [x] Separate form introduction from working/review identity. Render `GenerationResult` only when a candidate is available in a reviewable state. Use a compact heading treatment, generous space for the indicator/status, and secondary Cancel styling. Preserve keyboard focus when completion replaces the working region.
- [x] Verify at desktop and 390 px: status is visible without scrolling, no huge empty introduction above it, cancellation remains reachable, and reduced-motion users receive a static working icon plus status text. Update Storybook and the durable pattern; commit the completed task.

### Task 2: Explain the candidate and group its actions

**Files:** `apps/editor/src/GenerationResult.tsx`, `apps/editor/src/GenerationResult.test.tsx`, `apps/editor/src/StoryCreationScreen.tsx`, `apps/editor/src/StoryCreationScreen.test.tsx`, `apps/editor/src/StoryCreationScreen.stories.tsx`, `apps/editor/src/storyCreation.css`.

**Interface:** Add `onDiscard: () => void` and `discarding: boolean` to `GenerationResult`; keep deletion in the screen's existing service action. Disable competing mutations while applying/discarding. Enhancement label is Discard changes; new-story creation retains Discard result. Failed/cancelled jobs without a candidate retain a clear discard route outside the candidate component.

- [x] Extend the existing `reviewJob` test fixture to verify the new action is in the same group as Preview, Apply, and Edit, calls only the discard callback, and cannot run during acceptance.

```tsx
const discard = vi.fn();
render(
  <EarthStoriesProvider>
    <GenerationResult
      job={reviewJob}
      accepting={false}
      discarding={false}
      onAccept={vi.fn()}
      onEditInstructions={vi.fn()}
      onDiscard={discard}
    />
  </EarthStoriesProvider>,
);
const button = screen.getByRole("button", { name: "Discard changes" });
expect(
  screen.getByRole("group", { name: "Review story" }).contains(button),
).toBe(true);
fireEvent.click(button);
expect(discard).toHaveBeenCalledOnce();
expect(screen.getByText("What AI changed")).toBeTruthy();
```

- [x] Run the two affected editor test files, confirm the failures, then implement the action wiring and explanatory copy.
- [x] Derive the summary from the candidate/plan already used for preview. Present added/changed visual placements by chapter, with plain-language descriptions; retain an explicitly labeled existing chapter list only if useful inside the disclosure. Do not label unchanged metadata or palettes as newly generated.
- [x] Keep the deletion explanation next to the action group: “Discards this generated version; your story stays unchanged.” Keep actionable source warnings and original text differences. Verify ready/applying/discarding/error states and keyboard/narrow layouts; update fixtures and commit.

### Task 3: Support companion art without replacing chapter content

**Create:** `packages/story-schema/src/visualAccents.ts`, `packages/story-schema/src/visualAccents.test.ts`, `packages/viewer/src/ChapterVisualAccent.tsx`, `packages/viewer/src/ChapterVisualAccent.test.tsx`, `packages/viewer/src/chapterVisualAccent.css`, `apps/editor/src/VisualAccentInspector.tsx`, `apps/editor/src/VisualAccentInspector.test.tsx`.

**Modify:** schema `project.ts`, `publication.ts`, `generation.ts`, `index.ts` and compatibility tests; `packages/publisher/src/compile.ts`/`compile.test.ts`; viewer `StoryViewer.tsx`, `PublicationChapterRenderer.tsx`, `ScrollytellingBlock.tsx`, `AtlasStoryViewer.tsx`, `FocusedChapterViewer.tsx` and their relevant tests; editor `App.tsx` and chapter-removal/reconciliation paths; service `generation/vector-plan.ts`, `generation/enhancement.ts`, `generation/enhancement.test.ts`.

**Proposed contract:** An optional `visualAccents` array on current project/publication v3, with absence retaining current behavior. Reuse the existing constrained vector scene schema. Example shape:

```ts
type VisualAccent = {
  id: string;
  chapterId: string;
  placement: "leading" | "trailing" | "margin";
  scene: z.infer<typeof vectorSceneSchema>;
  alt: string;
};
```

`leading`/`trailing` are art bands within the chapter's visual presentation; `margin` is a reserved companion region, becoming an inline band on narrow screens. They are not new chapter IDs. Limit to 12 accents, one per chapter, unique IDs, valid chapter references, alt text 1–2000 characters, existing per-scene geometry limits, and a combined 600,000-character budget for sequence/accent geometry. Reject accents targeting a chapter already inside an immersive visual sequence to avoid double treatment. The generation-plan JSON schema explicitly requires an empty array when no accents are proposed; legacy saved projects/jobs may omit it.

**Rendering interface:** `ChapterVisualAccent({accent, progress, staticMode})` renders `SceneCanvas` in an app-owned slot. Parent chapter/block owns placement and progress; the agent does not choose CSS, z-index, DOM, or pointer behavior. Reuse/extract the existing nested-scrollport measurement logic. Never intercept map wheel/drag, chart hover, links, or attribution.

- [x] Write schema/compiler regressions covering a valid accent on a chart/scrolly chapter, unknown chapter, duplicate ID/target, image/executable payload rejection, geometry budget, legacy omission, deterministic compilation, and save/reopen. Verify old fixtures parse without synthesized art.
- [x] Implement the optional contracts, exports, compiler propagation, and additive enhancement assembly together. Include accents in requested-output checks and candidate digest construction; preserve old enhancement assets and warnings. Regression-test preview → service restart → apply so the accepted digest still matches.
- [x] Add the shared component and integrate all render paths. In grouped scrollytelling, art must use the narrative/section slot without adding a new chapter, duplicating the shared map, or interrupting grouping. Ensure atlas/focused views receive the same target art. For long groups, show the relevant chapter accent as that chapter enters, not all accents stacked over the map.
- [x] Browser-test real pointer interaction and layout; jsdom alone cannot prove this. A map drag, zoom, chart hover, source link, and keyboard action must still work. Verify narrow inline placement, no overflow/occlusion, readable static/print output, and equivalent preview/publication behavior.
- [x] Add basic author control in the existing chapter inspector: preview, placement choice, remove accent, and reuse applicable scene controls from `IllustrationInspector`. Removing/reordering a chapter must reconcile references without leaving invalid saved projects. No AI iteration interface is added.
- [x] Run schema, compiler, viewer, enhancement, and editor inspector tests; commit the complete contract-and-renderer unit only after each path works.

### Task 4: Generate and validate a whole-story visual plan

**Create:** `apps/local-service/src/generation/visual-treatment.ts`, `apps/local-service/src/generation/visual-treatment.test.ts`.

**Modify:** `apps/local-service/src/generation/chatgpt-provider.ts`/`.test.ts`, `enhancement-direction.ts`, `vector-plan.ts`, `custom-plan.test.ts`, `scene-quality.ts`/`.test.ts`; `packages/story-schema/src/generation.ts`; editor brief/recovery tests if the optional treatment setting below is added.

**Interfaces:** Add optional brief `visualTreatment: "focused" | "whole-story"`; absent saved briefs keep prior behavior, and new enhancement briefs default to whole-story. A small form choice may expose this next to visual direction, avoiding brittle keyword detection. Implement `inspectVisualTreatment(plan: StoryPlan, source: StoryProject): string[]`; it returns actionable repair messages using actual proposed placements, not the model's claims.

- [x] Add tests for whole-story output that contains only an opening sequence, three duplicate interludes, and genuinely varied/distributed treatment. The first two fail coverage; the last passes. Focused and legacy briefs must not inherit an unconditional three-treatment requirement. Validate target IDs and actual new renderable art, not mere changes to titles/palette.
- [x] Define the three distinct treatment categories from output: immersive narrative sequence, added illustrated transition, and companion art on existing content. Whole-story requests require all three with placements distributed across the source narrative, including meaningful art beyond the opening. Credits-only additions cannot satisfy distribution. For stories too short to meet this sensibly, return a clear limitation and offer focused treatment; do not fabricate prose or silently weaken the requested result.
- [x] Update the prompt to inspect the entire source, plan a recurring motif and its development, select meaningful entry/middle/later placements, and produce the supported treatments. Keep subject identity, palette, and visual language consistent across them. Distinguish illustrative movement from measured data, and keep reference coverage limits explicit.
- [x] Run coverage checks after assembly/contract checks inside the existing bounded repair loop. Add specific repair feedback, for example: “The result only illustrates the opening. Include an illustrated transition and companion art attached to later existing content.” Keep one repair, cancellation, timeout, and usage accounting; no unbounded generation loop or separate conversation agent.
- [x] Extend scene quality checks to accent scenes using their actual reserved aspect ratio/placement rather than full-screen crop assumptions. Count geometry across all generated art. Preserve animation-off requests and reduced-motion behavior.
- [x] Update What AI changed to summarize each treatment and its chapter location. This summary is derived from the generated candidate; no independent agent is claimed. Add whole-story/focused fixtures and regression coverage, then commit.

### Task 5: Verify the recorded journey and the visual result

**Files:** update `apps/editor/src/StoryCreationScreen.stories.tsx`, `apps/editor/src/VisualSequence.stories.tsx`, `docs/design/patterns.md`, and relevant publication fixtures/tests; retain the acceptance report under `.feedback/analysis/2026-11-22-followup/`.

- [x] Use deterministic Hurricane-like and Ice-like fixtures to exercise all three treatments. Check existing maps, charts, imagery, narrative, IDs, sources, and attribution remain intact. Test reordering/removing an accented chapter and save/reopen.
- [x] Generate fresh enhancements on disposable Hurricane and Ice copies using the existing connection. Review the full story, not just the opening or a few moving frames. Confirm coherent motif, at least three different uses, meaningful distribution, no repetitive filler, no added credit diagrams, and restrained text edits. Structural validity does not establish artistic quality; record any remaining shortfall honestly.
- [x] Exercise Preview → Edit instructions → regenerate → Preview → Apply → ordinary editing; separately verify Discard changes leaves the original story untouched. Test cancel/failure/retry and accepted-result labels. Do not publish a real story.
- [x] Verify desktop, 390 px phone, nested preview, reduced motion, static capture/print, and exported publication. A later-chapter visual must survive compilation and render without the authoring service. Include the required offline-runtime check for viewer changes.
- [x] Run baseline checks: `yarn typecheck`, `yarn test`, `yarn check:independence`, `yarn check:ui`, `yarn format:check`, `yarn build`, `yarn build:publication`, `yarn storybook:build`, `yarn test:publishing:no-git`, and `yarn test:offline-runtime`. Report any unchanged baseline failures separately; do not reformat unrelated data.
- [x] Open one ready-for-review PR with evidence, check review workflows actually ran, address valid findings, and recheck five minutes after requesting any manual review. Do not merge. Archive the sessions after shipping; delete recoverable extracted media while retaining transcripts and analysis.

## Acceptance and scope boundary

Generation/review acceptance succeeds when the working indicator is the dominant state, page identity is compact, Cancel stays visible, review copy describes the actual candidate, and Discard changes is beside the other actions.

Whole-story acceptance succeeds when the author can see a coherent illustration language recur in three different ways throughout the Hurricane story, with original interactive content and publishing control preserved. More artwork alone is not the criterion. Maps/charts retain their own measured meaning and unobstructed controls.

Excluded: reader typography redesign, replacing map data with generated graphics, autonomous publication, broad text rewriting, arbitrary CSS/JavaScript injection, mandatory decoration of every chapter, and a multi-agent or conversational editing workflow.

## Execution evidence (2026-11-23)

The tasks above were executed together. A checked verification task means the
check was performed; it does not conceal the limitations below.

- 1,499 tests passed across 188 test files. The isolated production service bundle
  check also passed (1 test). Three unrelated UI tests timed out during a concurrent
  build; the complete suite passed when rerun alone. Focused-preview filtering and archival stills gained
  regressions after validation exposed those missing paths.
- Typecheck, UI token checks, independence checks, editor/viewer builds, publication
  fixture build, Storybook build, and 126 no-Git publishing tests passed.
- The offline runtime browser proof passed with 26 same-origin resource paths.
  An earlier attempt timed out on map readiness; unchanged main passed, and the
  final branch rerun passed. No outside-origin requests were observed.
- All changed files pass formatting. Repository-wide formatting still reports
  four unchanged baseline files: the Kronebreen GeoJSON, the October 28 production
  proof plan, and both Roadless Rule GeoJSON files. They were left untouched.
- Browser checks covered the working indicator, adjacent review actions, desktop
  and 390 px layouts, whole-story Hurricane/Ice fixtures, focused chart preview,
  nested reader layout, and exact-value chart disclosure. No horizontal overflow
  was observed. The existing renderer remains authoritative for data controls.
- A live Ice generation using the existing ChatGPT connection produced one
  immersive opening, one waterline transition after the map section, and one
  later companion scene. It made zero original-text edits. Preview, explicit
  apply, ordinary prose editing, save, and reopen succeeded on a disposable copy.
  Desktop/phone visual inspection confirmed a recurring ice/ridge/water motif;
  geometric vector styling remains illustrative rather than photorealistic.
- Live Hurricane generation timed out twice on the default available model and
  once on another available account model. No partial result was applied. This
  limits live artistic/reliability acceptance for Hurricane; deterministic
  fixtures and provider repair tests pass, but they do not establish a successful
  live Hurricane generation. The existing four-minute timeout was preserved.
- Existing map-data inspection warnings remain visible. These direct service
  live checks supplied source data/configuration without browser map captures;
  they do not claim that the AI inspected every complete source or map image.
- Cancellation/retry, instruction recovery/regeneration, accepted-result copy,
  explicit acceptance, source-change protection, and discard are covered by
  component/service tests. The live apply check used copies only. No real story
  was modified or published, and the original dev service/ChatGPT connection was
  restored after each live check.

Review and any remaining browser-interaction findings are recorded in the PR.

### Review fixes and interaction proof

The first Claude review completed successfully. Its four findings were addressed:
accepted results now say Remove generation record and explain that applied changes
remain; the credits classifier uses anchored labels; singular artwork counts are
correct; and reconciliation removes only deleted-chapter accents. Sequence edits
that would overlap companion art are blocked with a visible explanation, and
schema validation still rejects conflicts without deleting artwork.

A browser check exposed focused map previews inheriting the usual overlaid-copy
layout. Accented focused maps now reserve separate space for copy and artwork.
Real browser zoom/drag passed, two scrolly steps retained one map, companion
transforms changed with scroll, and reduced motion held the authored still frame.
The interactive fixture disables its optional legend to avoid the existing legend
covering the map's zoom controls; production legend behavior was not changed.

A follow-up review identified companion artwork inside desktop scrolly overlay
cards. Accented groups now reserve a narrative column beside the shared map,
stacking in narrow containers and print. A regression keeps artwork outside
map overlay cards while preserving two steps and one map. Real browser geometry
checks confirmed separate map/art bounds on desktop, on 390 px phones, in narrow
embedded previews, and in print; scrolling and reduced-motion behavior remained intact.
