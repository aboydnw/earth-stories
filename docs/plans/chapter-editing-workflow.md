# Implementation plan: focused chapter editing and map composition

Status: implemented
Date: 2026-08-11

## Outcome

Make chapter editing feel like a focused authoring task instead of a form over
the project schema. Authors should be able to select a chapter, understand what
it still needs, edit its reader-facing content, compose map views directly on
the map, and reach specialist settings without scanning an unsectioned list of
controls.

Preserve the current local-first project format, explicit project Save action,
publisher/compiler authority, publication routes, static exports, and viewer
rendering behavior. The publication viewer remains the rendering source of
truth; the editor adds authoring composition and state around it.

## Success criteria

- Selecting a chapter always focuses the matching chapter canvas and editor.
- Map and scrolly chapters open an isolated, interactive map canvas at their
  authored camera. Authors never need to type coordinates for the common path.
- Map movement updates the chapter draft after the interaction settles, shows
  `View updated`, preserves a one-step Undo, and marks the project dirty through
  the existing global save lifecycle.
- The default map-chapter inspector shows Content and Data without requiring a
  long scroll. Reader behavior, layers, environment, and exact coordinates use
  task-based progressive disclosure; shared appearance is summarized and
  edited in Story data.
- Chapter-only values and shared-source values are visually and behaviorally
  separated. Shared-source edits say that they affect every chapter using the
  source and live in Story data.
- The chapter rail shows a useful status such as Ready, Add reader text, Choose
  data, Add alternative text, or Configure chart axes.
- The overlay editor lists only selected overlays. Adding another overlay opens
  a focused picker instead of showing every source as a checkbox.
- Flyover editing uses captured map views, reorderable keyframe cards, preview,
  recapture, presets, and warnings. Raw camera values are secondary.
- Video chapters accept one YouTube or Vimeo URL and derive provider and ID.
- At widths below the desktop breakpoint, Chapters, Canvas, and Edit become
  explicit accessible modes instead of three squeezed columns.
- Existing project fixtures continue to parse and publish. No new network or
  hosted-service dependency is introduced.

## Current constraints to preserve

- `StoryProject` remains the persisted authoring source of truth.
- `deriveAuthoringReadiness` remains the source for structural chapter findings.
  Extend it to report every deterministic compile-time rejection with structured
  resource context before compilation; the editor adapts those findings rather
  than creating another validator. Unexpected compiler exceptions may remain a
  project-level `compile` finding.
- `compileProject` and the publication schema remain authoritative for reader
  output.
- Product UI stays in `apps/editor` and `@earth-stories/ui`. Reader rendering,
  map runtime, and publication CSS stay in `@earth-stories/viewer`.
- Authored map and chart colors remain data-driven values, not product tokens.
- The editor's explicit Save action remains. Camera changes update the in-memory
  project draft; they do not silently claim to be saved to disk.

## Architectural decisions

### 1. Add a focused canvas without creating a second renderer

The center region gains two modes:

- **Edit chapter** renders only the selected chapter. Map-bound chapters use an
  interactive map; non-map chapters use a focused reader-faithful preview.
- **Preview story** renders the complete `StoryViewer` output.

Factor chapter rendering out of `StoryViewer` into a viewer-owned internal
renderer and expose a small `FocusedChapterViewer` contract. Both the full
story and editor canvas use the same map, chart, media, provenance, loading, and
error implementations. Do not recreate map layers in the editor.

Only the active canvas mounts during ordinary chapter editing. Do not keep a
full story containing several map runtimes mounted behind the focused canvas,
especially on narrow screens. The publication workshop is the explicit
exception: it switches to the full story canvas because snapshot capture needs
the complete reader DOM.

### 2. Treat map interaction as chapter-draft editing

`MapChapter` already reports camera changes. Add an editor hook that owns the
authoring lifecycle:

1. Initialize the live camera from the selected chapter.
2. While the user pans, zooms, rotates, or pitches, show `View changed`.
3. After 600–800 ms without movement, copy the live camera into the chapter via
   the ordinary project update path.
4. Show `View updated` and retain the pre-interaction camera as Undo.
5. The global `SaveStatus` becomes dirty as it does for any other project edit.
6. Undo restores the prior chapter camera and updates the canvas.
7. Reset to saved view restores the camera from the last project revision that
   was successfully persisted on this computer.

Use tolerances when comparing cameras so floating-point noise does not dirty the
project. Flyover canvas movement is never written to a keyframe automatically;
flyover keyframes continue to use explicit Capture and Recapture actions.

### 3. Keep chapter scope and shared-source scope distinct

The chapter inspector owns:

- title and narrative;
- chapter type-specific content;
- source selection;
- camera and map environment;
- reader behavior and temporal position;
- selected overlays;
- flyover path.

Story data owns:

- source label and attribution;
- delivery/publication policy;
- source-kind configuration;
- shared presentation values such as colormap, rescale, filtering, and legend;
- provenance.

The chapter inspector may summarize shared appearance and offer **Edit shared
source**, but it must not present these controls as chapter-local. Show source
usage count and the text `Affects every chapter using this source` before an
author edits shared settings.

Do not introduce chapter-level presentation overrides in this work. That would
require a separate product decision, schema contract, compiler precedence, and
reader explanation.

### 4. Reuse existing UI contracts and keep feature layout local

Use `FormField`, the tokenized inputs, `CheckboxField`, `InspectorSection`,
`CollapsibleSection`, `StatusBadge`, `StatusNotice`, `PanelShell`, and
`SaveStatus`. Extend these contracts only when a behavior is used by at least
two feature components.

Keep the editor grid, canvas toolbar, chapter list, source picker, overlay
picker, and keyframe cards in `apps/editor`. Do not move page composition into
`@earth-stories/ui`.

### 5. Derive chapter readiness from existing findings

Create an editor adapter that groups `deriveAuthoringReadiness(project)`
findings by chapter, applies a stable display priority, and returns one compact
row state:

1. blocking missing or incompatible data;
2. blocking required type configuration;
3. missing title;
4. missing narrative;
5. missing alternative text;
6. ready.

Do not persist readiness on chapters. The rail and publish flow must update from
the same underlying findings. Put finding priority in a shared editor helper so
chapter rows and `nextGuidanceAction` cannot silently drift. Project-level
save/preview/preflight precedence remains owned by the top bar.

Resource findings without a `chapterId` map to every chapter that references
that primary or overlay source. Before `compileProject` runs,
`deriveAuthoringReadiness` must emit these structured resource findings for all
known delivery-policy and source-configuration rejections. A generic compile
error is only the fallback for an unexpected exception that cannot be assigned
to a resource or chapter.

### 6. Keep responsive mode and disclosure state ephemeral

`Chapters | Canvas | Edit`, focused/full-preview mode, open disclosures,
selected overlay picker, camera Undo, and flyover scrub position are editor UI
state. They do not belong in `story.json`.

On narrow screens, selecting a chapter moves to Edit. Selecting **Edit view** or
**Preview on map** moves to Canvas. Preserve the selected chapter and unsaved
form values while switching modes.

### 7. Compile focused previews through the publisher

The full publication manifest may be unavailable because a different chapter
is incomplete. Add a browser-safe publisher helper that compiles a temporary
single-chapter projection of the current project through `compileProject`.
This keeps compiler behavior authoritative while allowing an otherwise valid
selected chapter to remain editable.

The focused compiler must never mutate or persist the project, relax validation
for the selected chapter, or become a second export path. It returns the same
publication manifest contract consumed by the viewer.

Prune the temporary project to the selected chapter and only its referenced
primary and overlay sources. Keeping the complete source library would allow an
unrelated invalid source to break the focused preview. When a valid full-story
manifest already exists, do not compile again: select the chapter from that
manifest and reserve focused compilation for the full-compile failure path.

### 8. Preserve the publication snapshot contract

Opening the publication workshop forces `canvasMode="story"` and the narrow
`editorRegion="canvas"` so the complete `StoryViewer` is visibly mounted with
`snapshotMode`. Save the prior canvas mode and region and restore them when the
workshop closes. Publication actions and snapshot capture stay unavailable
until a full manifest exists.

This preserves the current capture contract, which discovers chapter maps in
the reader DOM and uses the first `.story-map` for the share card. Do not make
publication capture depend on a focused chapter canvas. Flyover Capture and
Recapture, however, must read the current focused-canvas camera directly rather
than depending on the full-story viewer's camera callback.

### 9. Preserve legacy automatic map framing deliberately

Removing reader auto-fit is a reader-visible behavior change. Treat the exact
legacy creation pose — longitude `0`, latitude `20`, zoom `1.5`, bearing `0`,
and pitch `0` — as an automatic-fit sentinel. Preserve data auto-fit for that
pose only; every non-default authored camera wins after data loads.

When the editor opens a legacy-default chapter, label it `Using automatic fit`
and offer **Use fitted view**. This commits the fitted camera and opts the
chapter into authored framing. New map chapters should fit once after their
first source is assigned and commit that result before save. Avoid a schema
migration until the product needs an explicit camera-mode field.

## Target desktop composition

```text
┌────────────────┬────────────────────────────┬──────────────────────┐
│ Chapters       │ Edit chapter | Preview     │ Chapter 02 · Map     │
│                │                            │                      │
│ 01 Ready       │ Interactive selected map   │ CONTENT              │
│ 02 Choose data │ or focused media preview   │ title + narrative    │
│ 03 Ready       │                            │                      │
│                │ View updated · Undo        │ DATA                 │
│ + Add chapter  │ Fit to data · Reset        │ compact source       │
│                │                            │                      │
│ Story data     │                            │ READER BEHAVIOR  ▸   │
│ Story settings │                            │ LAYERS            ▸  │
│                │                            │ ADVANCED          ▸  │
└────────────────┴────────────────────────────┴──────────────────────┘
```

## Component and file plan

### Editor orchestration

#### `apps/editor/src/App.tsx`

- Reduce the component to route/project orchestration, persistence, compiler
  results, publication actions, data jobs, and high-level editor state.
- Add `editorRegion: "chapters" | "canvas" | "edit"` for narrow layouts and
  `canvasMode: "chapter" | "story"` for the center region.
- Add `selectedDataSourceId` so Story data can edit a source independently of
  the current chapter.
- Reuse the full publication manifest for the focused chapter whenever full
  compilation succeeds. Invoke focused compilation only when the full manifest
  is unavailable because another chapter or source is invalid.
- Keep a last-successfully-persisted project snapshot, initialized when a
  project is activated/opened and replaced after every successful save. Pass
  the selected chapter camera from that snapshot to `useChapterCameraDraft` so
  **Reset to saved view** has a real producer and stable meaning.
- Extract local-service asset URL rewriting from the current full-preview path
  into `resolvePreviewManifest.ts` and apply it to both full and focused
  manifests.
- When the publication workshop opens, store the current canvas/region,
  visibly mount the full story canvas with `snapshotMode`, and restore the prior
  mode on close. Disable publication actions until a full manifest exists.
- Replace the inline chapter rail, inspector JSX, and preview JSX with the
  components below.
- Provide typed update callbacks such as `updateChapter`, `updateSource`,
  `assignSourceToChapter`, and `openSourceDetails` instead of passing the full
  `changeProject` function into leaf controls.
- Keep the existing import, conversion, connection, save, readiness, preview,
  and publish behavior intact during extraction.
- Remove obsolete inspector refs and drafts after their owning feature is
  extracted.

#### `apps/editor/src/PublishPanel.tsx`, `captureSnapshots.ts`, and `captureShareCard.ts`

- Keep the existing document-based snapshot contract: publishing must capture
  the visibly mounted full `StoryViewer`, never a focused-chapter surrogate.
- Disable capture/export actions with a clear explanation until the full
  manifest and snapshot-mode story canvas are ready.
- Preserve `waitForMap` readiness behavior and add integration coverage that
  opening Publish switches canvases before capture, captures every map-bearing
  chapter, uses the first full-story map for the share card, and restores the
  previous editor mode on close.

#### `apps/editor/src/EditorShell.tsx` (new)

- Own the three-region desktop composition and narrow-screen tab semantics.
- Use `960px` as the mode boundary: three regions above it and one active
  region at or below it. At 1024px, use a compact 200px chapter rail and a
  360px inspector so the canvas retains roughly 464px before outer chrome.
- Render accessible `tablist`/`tabpanel` relationships for Chapters, Canvas,
  and Edit below the desktop breakpoint.
- Keep all three regions visible at desktop widths; render only the active
  region below the breakpoint so hidden maps do not continue consuming GPU and
  network resources.
- Preserve logical DOM and keyboard order: chapters, canvas, editor.
- Expose slots for rail, canvas, inspector, blocking guidance, and errors.
- Do not own project data or perform mutations.

#### `apps/editor/src/EditorViewTabs.tsx` (new, feature-owned)

- Implement arrow-key, Home, End, `aria-selected`, `aria-controls`, and focus
  movement behavior.
- Use 44px touch targets at 390px and 768px.
- Add a component test for pointer and keyboard switching.

### Chapter rail and readiness

#### `packages/publisher/src/readiness.ts`

- Extend `deriveAuthoringReadiness` so every deterministic rejection currently
  discoverable only during `compileProject` is emitted before compile with a
  `chapterId` or `resourceId` whenever one exists.
- Cover delivery-policy failures and source-kind configuration failures without
  duplicating compiler rules: factor shared predicates where necessary.
- Keep the generic project-level `compile` finding only for unexpected compiler
  exceptions.
- Add contract tests showing a rejected resource can be attributed before
  compilation and an unexpected throw still produces the generic fallback.

#### `apps/editor/src/ChapterRail.tsx` (new)

- Extract Story settings, chapter rows, chapter actions, Add chapter, and Story
  data navigation from `App.tsx`.
- Render chapter number, title, type label, and one readiness message.
- Use icon plus words for Ready/warning/error; never rely on color alone.
- Keep reorder, duplicate, and delete actions keyboard accessible.
- Preserve selection after reorder and duplication.
- Keep delete disabled for the last remaining chapter and retain the current
  project behavior for unused sources until that deletion policy is separately
  reviewed.
- On narrow screens, call `onRequestRegion("edit")` after chapter selection.

#### `apps/editor/src/chapterReadiness.ts` (new)

- Adapt publisher findings into `ready | warning | error` plus a concise label.
- Map resource-scoped findings to every chapter that references the resource as
  its primary source or an overlay.
- Map long publisher resolutions to short authoring labels without changing the
  authoritative finding.
- Prefer active blockers over recommendations and return the complete findings
  for accessible labels/tooltips.
- Add table-driven tests covering every chapter type, missing sources,
  incompatible sources, missing narrative, missing alt text, and Ready.

#### `apps/editor/src/readinessPriority.ts` (new)

- Define the stable ranking for readiness findings once.
- Use it from both `chapterReadiness` and the finding-ranking portion of
  `nextGuidanceAction`; keep save, preview, and preflight precedence in the
  top-level guidance flow.
- Add a parity test proving the rail and next-action guidance choose the same
  highest-priority finding for a chapter.

#### `apps/editor/src/ChapterAddMenu.tsx`

- Group common choices first: Text, Guided map, Map, and Image.
- Put Video, Chart, and Flyover behind **More chapter types** while keeping the
  currently focused group keyboard reachable.
- Keep concise purpose descriptions and expose disabled prerequisites in text.
- Where a type requires unavailable data, offer **Add data for this chapter**
  rather than a dead end. Store a temporary creation intent and create the
  chapter only after a compatible source is available.
- Do not add a permanently visible chapter-type switcher to the inspector.
- Extend tests for grouping, disclosure, creation intent, Escape, and focus
  return.

### Focused chapter canvas

#### `packages/publisher/src/focusedPreview.ts` (new)

- Export `compileFocusedChapter(project, chapterId)` as a browser-safe helper.
- Build an ephemeral project containing the selected chapter and only the
  primary/overlay sources it references, then delegate to `compileProject`.
- Preserve project-level values required by compilation, but never retain
  unrelated chapters or sources.
- Return a typed missing-chapter or compilation error suitable for a bounded
  editor state.
- Add tests proving an unrelated broken chapter and an unrelated invalid source
  do not prevent a valid selected chapter from rendering, while a broken
  selected chapter or referenced source still fails honestly.

#### `packages/publisher/package.json`

- Add a browser-safe `./focused-preview` subpath export for the helper and its
  public result/error types.
- Import this subpath from the editor. Do not re-export it through the main
  publisher index, which also exposes Node-only build, archive, and preflight
  modules.

#### `apps/editor/src/resolvePreviewManifest.ts` (new)

- Extract the existing local-service asset-href rewriting from `App.tsx` into a
  pure helper.
- Apply it identically to full and focused manifests so maps, images, charts,
  and other compiled assets resolve in either canvas mode.
- Add tests for local asset paths, already-absolute URLs, overlays, and
  immutability of the compiler result.

#### `packages/viewer/src/FocusedChapterViewer.tsx` (new)

- Accept a compiled `PublicationManifest`, `chapterId`, interactive-map flag,
  camera callback, optional fit request token, and ordinary loading callbacks.
- Find the chapter and only its required primary/overlay assets.
- Render map, scrolly, flyover, prose, image, video, and chart content through
  the same viewer-owned chapter renderer used by `StoryViewer`.
- For map/scrolly authoring, render a normal interactive `MapChapter` at the
  authored camera without the story masthead, folio, footer, or publication
  progress bar.
- For flyover authoring, render an interactive map scene at the editor's current
  preview pose; scrolling the canvas must not mutate keyframes.
- Render a bounded empty/error state when the chapter or source cannot compile.
- Keep product toolbar buttons out of this package.
- Treat a full manifest plus `chapterId` and a single-chapter fallback manifest
  identically; the viewer must not care which compile path produced it.

#### `packages/viewer/src/PublicationChapterRenderer.tsx` (new, internal)

- Extract the chapter/asset dispatch currently embedded in `StoryViewer`.
- Preserve viewer CSS classes, provenance, temporal controls, loading states,
  and source-unavailable behavior.
- Support `full-story`, `focused-preview`, and `authoring-map` composition flags
  without branching on editor concepts.
- Keep scrollytelling block grouping in `StoryViewer`; a focused scrolly chapter
  renders as one editable map scene plus its narrative preview.

#### `packages/viewer/src/StoryViewer.tsx`

- Delegate individual chapter rendering to `PublicationChapterRenderer`.
- Keep the public story structure, progress, grouped scrollytelling, masthead,
  provenance, and footer unchanged.
- Preserve data auto-fit only for the exact legacy-default pose. Add regression
  coverage proving that pose still fits to data and every non-default authored
  camera wins after data loads.

#### `packages/viewer/src/MapChapter.tsx`

- Preserve the current renderer and source-layer paths.
- Add a fit-request contract that can fit known primary-source bounds on demand
  without leaking a MapLibre instance into product UI.
- Distinguish `interactive` from camera-following behavior; the existing
  `controlled` name is ambiguous because it currently disables interaction.
  Introduce `interactive` (the user may manipulate the map) and `followCamera`
  (prop camera changes are applied after mount), while retaining a temporary
  compatibility path for `controlled` during migration.
- Track programmatic movement in both interactive and non-interactive modes.
  Set the programmatic flag before `jumpTo`, `flyTo`, or `fitBounds`, clear it
  on `moveend`, and emit camera changes only for movement not carrying that
  flag.
- Report camera changes only for user interaction, not programmatic chapter
  selection, fit, reset, or reduced-motion jumps.
- Ensure Fit to data is available only after bounds are known and reports an
  unavailable state otherwise.
- Add tests for initial authored camera, user movement, programmatic movement,
  fit requests, source changes, reset, and reduced motion.

#### `packages/viewer/src/index.ts`

- Export `FocusedChapterViewer` and its public props.
- Do not export MapLibre implementation types as part of the editor contract.

#### `apps/editor/src/ChapterCanvas.tsx` (new)

- Render the **Edit chapter / Preview story** mode switch and the appropriate
  viewer component.
- Key the focused renderer by chapter ID so selection reliably initializes the
  matching authored camera.
- For map/scrolly chapters, show `View changed`, `View updated`, Undo, Fit to
  data, and Reset to saved view as map chrome.
- For flyovers, show current keyframe/preview position but require explicit
  Capture or Recapture.
- Read Capture and Recapture poses from the focused canvas camera contract, not
  the full-story `previewCamerasRef`.
- For non-map chapters, show the focused content preview with no irrelevant map
  toolbar.
- Announce view updates politely without stealing focus.
- Restore focus to the canvas mode trigger when an unavailable preview closes.

#### `apps/editor/src/useChapterCameraDraft.ts` (new)

- Own live camera, comparison tolerances, debounce, commit, Undo, reset, and
  chapter-switch behavior.
- Receive the last successfully persisted camera separately from the mutable
  project-draft camera so Reset has stable meaning after automatic updates.
- Use fake timers in unit tests.
- Cancel pending commits on unmount and chapter change.
- Never apply a delayed camera from chapter A to chapter B.
- Do not emit a project update when the camera is within tolerance.
- Preserve terrain, globe, and buildings when updating pose values.
- Clear Undo after a project reload; it is intentionally session-only.
- Treat initial chapter selection, Fit, Reset, source-assignment fit, and
  reduced-motion jumps as programmatic: they update the intended draft only
  through their explicit command path and never through the user-move callback.

### Chapter inspector composition

#### `apps/editor/src/ChapterInspector.tsx` (new)

- Own the common inspector heading and dispatch to a type-specific editor.
- Show chapter number, human-readable type, readiness state, and scope.
- Receive typed chapter/source/update contracts; do not receive the entire
  project mutation function.
- Keep Content open. Use collapsed task groups for secondary controls.
- Add an empty state when no chapter is selected.

#### `apps/editor/src/chapter-editors/ChapterContentSection.tsx` (new)

- Reuse `InspectorSection`, `FormField`, `TextInput`, `TextArea`, and the
  existing `MarkdownToolbar`.
- Own title, narrative, narrative warning, stable IDs, and accessible help/error
  association.
- Keep the narrative writing surface comfortably sized and visually dominant.
- Serve prose, map, scrolly, and flyover editors; media/chart editors may reuse
  the title field while providing their own content order.

#### `apps/editor/src/chapter-editors/MapChapterEditor.tsx` (new)

Compose these groups in this order:

1. **Content** — title and narrative, open.
2. **Data** — compact current source summary, Change, and Edit shared source.
3. **Reader behavior** — map/guided mode, transition, overlay position, and
   conditional chapter time.
4. **Layers** — selected overlays and Add overlay.
5. **Map environment** — globe, terrain, terrain exaggeration, and buildings.
6. **Exact coordinates** — zoom, longitude, latitude, bearing, and pitch.

Reader behavior, Layers, Map environment, and Exact coordinates are collapsed
by default unless a validation problem inside them needs attention. Do not
render source label, provenance, delivery policy, renderer variables, colormap,
filtering, or legend controls here.

#### `apps/editor/src/chapter-editors/ProseChapterEditor.tsx` (new)

- Render Content only.
- Avoid empty Advanced or Settings sections.

#### `apps/editor/src/chapter-editors/ImageChapterEditor.tsx` (new)

- Order fields as title, image/source, alternative text, caption/narrative.
- Show the selected image thumbnail where available.
- Treat missing alternative text as an inline warning connected to the field.
- Route Replace image through the focused data flow.

#### `apps/editor/src/chapter-editors/VideoChapterEditor.tsx` (new)

- Replace Provider, Video ID, and Original URL with one Video URL field.
- Parse supported YouTube and Vimeo URL variants and derive existing schema
  fields without changing the stored contract.
- Show detected provider as quiet status and show an inline actionable error for
  unsupported URLs.
- Show the stored `originalUrl` verbatim. If it is unparseable or resolves to a
  different provider/video ID than the stored embed fields, keep previewing the
  stored provider/ID and show `Stored URL and video embed disagree. Re-enter
URL to reconcile.` Do not silently canonicalize or overwrite legacy data.
- On a new valid entry, update provider, video ID, and original URL atomically.
  A canonical current-embed suggestion is optional only when the stored
  provider and ID are themselves valid.
- Order fields as title, Video URL, caption/narrative.

#### `apps/editor/src/videoUrl.ts` and `videoUrl.test.ts` (new)

- Implement a pure URL parser for ordinary, shortened, embed, and privacy-mode
  YouTube URLs plus Vimeo URLs.
- Reject non-HTTP(S), unsupported hosts, missing IDs, credentials, and malformed
  URLs.
- Return `{ provider, videoId, originalUrl }` for the existing schema.
- Add legacy mismatch tests for unparseable original URLs, differing IDs,
  differing providers, and successful atomic reconciliation.

#### `apps/editor/src/chapter-editors/ChartChapterEditor.tsx` (new)

- Order groups as Content, Data, Chart, Axes, and Advanced range.
- Keep chart type, X column, primary Y column, and additional Y columns in the
  open Chart section.
- Put scale, axis labels, series column, and min/max range behind task-based
  disclosures.
- Preserve current chart schema and compiler behavior.

#### `apps/editor/src/chapter-editors/FlyoverChapterEditor.tsx` (new)

- Compose Content, Data, Flyover path, Reader behavior, Overlays, and Map
  environment.
- Delegate path editing to `FlyoverPathEditor`.
- Treat overlay selection as a newly added authoring capability: reuse the same
  overlay list/picker contracts as map chapters and verify it compiles and
  renders end to end.
- Keep raw keyframe coordinates inside each keyframe's disclosure, not in the
  default list.

### Data and shared-source editing

#### `apps/editor/src/ChapterDataSelector.tsx` (new)

- Present the active source as a compact summary with name, kind, delivery, and
  usage count.
- Open a focused picker listing only compatible sources for the chapter type.
- Include Upload data and Connect public data as secondary outcomes that route
  to Story data; do not embed ingestion forms in the inspector.
- Surface missing/unavailable selected data with a replacement action.
- On selection, preserve current terrain-compatibility behavior and request Fit
  to data once the new source bounds are available. For a newly created map
  chapter, commit that first fitted pose to the draft; for an existing authored
  chapter, require the explicit Fit action so changing data does not silently
  discard its composition.

#### `apps/editor/src/StoryDataPanel.tsx` (new)

- Extract the current project data library, import, preparation, and connection
  JSX from `App.tsx` without changing service contracts.
- Add `selectedSourceId` and a source-details region.
- Support focus destinations for `library`, `import`, `connect`, and
  `source-details` so chapter actions can route directly to the needed task.
- Preserve conversion progress, partial failure, retry, and prepared-source
  behavior.

#### `apps/editor/src/SourceDetailsEditor.tsx` (new)

- Move source label, attribution, delivery policy, source-kind settings, shared
  presentation, legend, filtering, and `SourceProvenanceFields` out of the
  chapter inspector.
- Begin with a shared-scope notice and list/link the chapters using the source.
- Group settings as Source identity, Publication delivery, Data interpretation,
  Map appearance, Filtering and legend, and Provenance.
- Use source-kind conditional fields only after the general groups.
- Keep destructive source removal in Story data, including dependent-chapter
  protection.

#### `apps/editor/src/SourcePresentationFields.tsx` (new)

- Extract and type the current source-kind and presentation updates now inline
  in `App.tsx`.
- Use tokenized form controls and task-based disclosures.
- Keep category color JSON validation state local and test valid, invalid, and
  recovery paths.
- Do not move authored colors into product tokens.

### Overlay editing

#### `apps/editor/src/OverlayListEditor.tsx` (new)

- Render only `overlaySourceIds` in their stored order.
- Each row shows source name, kind, and Remove; membership in the list is the
  current visibility contract.
- Expand one row at a time for any available shared-source summary; route full
  styling to Source details.
- Handle a missing referenced source with Replace or Remove.
- Provide one **Add overlay** action.

#### `apps/editor/src/OverlayPickerPanel.tsx` (new)

- Use `PanelShell` and list compatible sources excluding the primary source and
  already-selected overlays.
- Provide search when the candidate list exceeds a small threshold.
- Support keyboard selection, Escape, focus return, empty state, and Add data.
- Add the selected overlay without changing its shared styling.

### Flyover path editing

#### `apps/editor/src/FlyoverPathEditor.tsx` (new)

- Make **Add keyframe from current view** the primary action.
- Render compact reorderable keyframe cards with sequence number, optional
  caption, zoom/pitch/bearing summary, Jump, Recapture, and Delete.
- Provide button-based move up/down as the keyboard equivalent to drag reorder.
- Disable deletion when only two keyframes remain unless the schema is relaxed
  in a later project-format decision.
- Add Orbit and Approach presets generated from the current camera.
- Include bearing in every exact-coordinate disclosure. Orbit must preserve and
  advance from the current bearing with normalized angles; Approach must
  preserve the intended heading unless its preset explicitly changes it.
- Show a scrubber that previews interpolation without mutating stored frames.
- Warn about large zoom jumps and other renderer-relevant discontinuities.
- Keep exact coordinates in a per-keyframe disclosure.

#### `apps/editor/src/flyoverPath.ts` and `flyoverPath.test.ts` (new)

- Add pure helpers for capture, recapture, reorder, Orbit, Approach, comparison,
  warnings, and interpolation preview inputs.
- Use deterministic preset generation and table-driven tests.
- Test bearing normalization across `0°/360°` and negative-angle inputs.
- Reuse viewer interpolation utilities where their contract is appropriate;
  do not duplicate the flight algorithm.

#### `packages/story-schema/src/project.ts`

- Add an optional/defaulted `caption` to a dedicated flyover keyframe schema.
- Export `FlyoverKeyframe` separately from the general `Camera` type.
- Keep old v1 projects valid through defaults. Do not require a schema-version
  migration for an optional field.

#### `packages/story-schema/src/publication.ts`

- Mirror the optional/defaulted flyover keyframe caption in publication output.

#### `packages/publisher/src/compile.ts`

- Copy flyover keyframe captions into the publication contract.
- Keep all other chapter compilation behavior unchanged.

#### `packages/viewer/src/FlyoverChapter.tsx`

- Display the active keyframe caption as reader-facing map copy when present.
- Update the caption as scroll/scrub progress crosses keyframes without
  announcing every animation frame.
- Preserve a readable narrative-only path when the map cannot load.
- Route its direct camera jumps through the same programmatic-movement guard as
  `MapChapter` so playback, scrub, selection, and reduced-motion jumps cannot be
  mistaken for author camera edits.

#### `packages/publisher/src/archive.ts`

- Include non-empty flyover keyframe captions in archival/static fallback
  content so they are not lost when animation is unavailable.

### Shared UI extensions

#### `packages/ui/src/ProductPatterns.tsx`

- Extend `CollapsibleSection` with optional description/summary content and an
  optional issue indicator so collapsed groups can say `2 overlays`,
  `Zoom 5.2 · Pitch 35°`, or `Needs attention`.
- Preserve current callers and default behavior.
- Do not add map-specific terminology or project mutation logic.

#### `packages/ui/src/Patterns.stories.tsx`

- Add collapsed summaries, warning state, long summary, keyboard focus, and
  narrow-width examples.

#### `packages/ui/src/components.test.tsx`

- Verify disclosure semantics, keyboard activation, accessible issue text, and
  value persistence while collapsed.

Land the `CollapsibleSection` API, its stories, tests, and consumer migration in
the same PR so `check:ui` never sees an undocumented shared-component contract.

### Styling and visual hierarchy

#### `apps/editor/src/editor.css`

- Replace duplicate historical editor/inspector overrides with one authoritative
  section for the new shell.
- Use a stable desktop grid: chapter rail, flexible canvas, and a
  `minmax(360px, 420px)` inspector. Consider resizing only after the simplified
  hierarchy is validated.
- Give Content and the canvas primary visual weight. Use spacing and dividers
  for ordinary groups; reserve elevated/bordered surfaces for pickers,
  warnings, and map chrome.
- Use the established 12px field gap and 20px section gap.
- Give technical numeric summaries tabular/monospace treatment.
- Add visible hover, active, focus, disabled, dirty, warning, and saved states.
- Position map chrome with existing map-control z-index tokens and verify
  collision with navigation, legend, attribution, temporal controls, and map
  errors.
- At the desktop breakpoint, switch from the three-region grid to one active
  tab panel at `960px`. Treat 1440px as normal desktop, 1024px as compact
  three-region desktop, and 768px/390px as tabbed layouts.
- Honor reduced motion for tab transitions, map focus, and status feedback.

#### `packages/viewer/src/viewer.css`

- Add only the focused-renderer and authoring-map layout hooks needed by the
  viewer-owned canvas.
- Do not import product-panel styling or make reader output depend on editor
  tokens.
- Preserve standalone publication and embed output.

### Documentation and executable examples

#### `docs/design/patterns.md`

- Promote **Editor chapters** when the workflow ships and document:
  focused canvas versus full story preview, derived readiness, camera draft
  lifecycle, source scope, progressive disclosure, and narrow-screen modes.
- Add a map-authoring rule that map composition happens directly on the map and
  that exact coordinates are an advanced path.
- Clarify that `View updated` means project draft state; only global Save means
  the project is persisted on this computer.

#### `docs/design/components.md`

- Register stable chapter editor feature components as editor-owned patterns,
  not shared UI primitives.
- Update the `CollapsibleSection` contract if its summary/issue API ships.
- Keep `FocusedChapterViewer` viewer-owned.

#### `docs/ux-improvement-backlog.md`

- Link existing items 4, 5, 7, 8, and 9 to this plan.
- Add scoped entries for the overlay picker, single-URL video editing, and the
  flyover path workflow; those capabilities are not represented by the current
  backlog items.
- Mark them implemented only after the final validation wave lands.

#### `apps/editor/src/EditorPatterns.stories.tsx`

- Add stable fixtures for prose, map, guided map, image, video, chart, and
  flyover inspectors.
- Add chapter rail Ready/warning/error states, shared-source scope, missing data,
  overlay picker, camera changed/updated/Undo, and long chapter titles.
- Add composed editor-shell stories at 1440, 1024, 768, and 390 widths without
  requiring the local service.
- Use local fixture manifests and avoid live public sources for the default
  Storybook test path.

## Suggested PR sequence

### PR 1a — Extract editor boundaries without changing behavior

**Outcome:** create reviewable boundaries before changing the workflow.

- Extract `EditorShell`, `ChapterRail`, `ChapterInspector`, `StoryDataPanel`,
  `SourceDetailsEditor`, and typed update helpers.
- Move raw form controls to existing `@earth-stories/ui` form contracts.
- Retain the existing class names and CSS untouched wherever extraction allows.
- Add characterization tests and Storybook fixtures matching current behavior,
  especially project mutations currently coordinated by `App.tsx`.

**Exclusions:** no focused canvas, camera autosave, new grouping, or new schema.

### PR 1b — Consolidate editor CSS without changing appearance

**Outcome:** establish one styling layer before introducing the new hierarchy.

- Remove duplicate historical editor/inspector overrides in small, traceable
  groups while preserving the extracted components' current rendering.
- Record before/after screenshots at 1440, 1024, 768, and 390 pixels.
- Treat any intentional visual or breakpoint change as out of scope for this PR.
- Run the full component, Storybook, and UI-governance checks after cleanup.

### PR 2 — Focused canvas and camera composition

**Outcome:** map view is edited visually in the center canvas.

- Add viewer chapter-renderer extraction and `FocusedChapterViewer`.
- Add the browser-safe publisher subpath, pruned focused compiler, shared asset
  URL resolver, and full-manifest reuse path.
- Add `ChapterCanvas` and chapter/story canvas modes.
- Add `useChapterCameraDraft`, View changed/updated, Undo, reset, and Fit to data.
- Add explicit interactive/follow-camera semantics and programmatic movement
  guards across map and flyover renderers.
- Preserve legacy-default auto-fit while making non-default authored cameras
  authoritative.
- Preserve full-story snapshot capture when the publication workshop opens.
- Validate map runtime, temporal sources, reduced motion, and publication parity.

### PR 3 — Simplified map inspector and source separation

**Outcome:** the common map workflow fits into a small, understandable inspector.

- Add common Content, compact Data, Reader behavior, Layers, Map environment,
  and Exact coordinates groups.
- Extend `CollapsibleSection` with its stories/tests in this same PR.
- Add `ChapterDataSelector`, `OverlayListEditor`, and `OverlayPickerPanel`.
- Move all shared source controls to Source details with usage/scope messaging.
- Remove inline upload/connect workflows from chapter editing.

### PR 4 — Type-specific editors and flyover workflow

**Outcome:** each chapter type has a concise task-oriented editor.

- Add prose, image, video, chart, and flyover editor components.
- Add video URL parsing.
- Add flyover keyframe cards, capture/recapture, reorder, presets, warnings,
  scrub preview, and reader-facing captions.
- Add flyover overlay authoring and end-to-end compile/render coverage.
- Add backward-compatible schema, compiler, viewer, and archive coverage for
  captions.

### PR 5 — Chapter readiness, creation flow, and responsive modes

**Outcome:** authors always know what needs attention and can work at all target
widths.

- Add the readiness adapter and rail statuses.
- Extend publisher readiness for deterministic resource failures and share the
  finding-priority helper with next-action guidance.
- Group common/specialist chapter types and add creation intents for missing
  prerequisites.
- Complete Chapters/Canvas/Edit narrow-screen behavior and keyboard navigation.
- Exercise long titles, high chapter counts, missing sources, and error states.

### PR 6 — Visual polish, documentation, and final workflow QA

**Outcome:** ship the complete experience as an established editor pattern.

- Finish spacing, hierarchy, map-control collision, focus, and reduced-motion
  polish.
- Complete Storybook workflow/state coverage.
- Update design patterns, components, backlog, and a shipping devlog.
- Run end-to-end author journeys for every chapter type and publishing output.

Each PR should leave the editor usable and all tests green. PR 1a and PR 1b are
separate review boundaries even if they share a feature branch. Avoid a
long-lived change that replaces the entire inspector at once.

## Validation plan

### Unit and component tests

- Chapter readiness priority and copy.
- Structured readiness for deterministic compiler rejections, resource-to-
  chapter attribution, and priority parity with next-action guidance.
- Responsive editor tabs and focus movement.
- Chapter selection preserving canvas/editor alignment.
- Camera tolerances, debounce, stale timer cancellation, Undo, reset, and
  project dirty state, including a persisted-project snapshot replaced only
  after successful saves.
- Fit-to-data behavior, legacy-default automatic fit, first-source fit, and
  non-default authored camera persistence.
- Programmatic move suppression for jump, fly, fit, reset, source selection,
  flyover scrub/playback, and reduced motion.
- Focused compilation prunes unrelated sources, reuses a valid full manifest,
  and resolves local-service asset URLs identically to full preview.
- Data compatibility filtering and missing-source replacement.
- Source usage/scope messaging.
- Selected-overlay ordering, add, remove, missing source, and focus return.
- Video URL parsing, legacy URL/embed mismatch, atomic reconciliation, and
  inline errors.
- Chart disclosure and field updates.
- Flyover capture, recapture, reorder, bearing-normalized presets,
  interpolation scrub, warnings, overlays, and minimum-keyframe protection.
- Publication opening/closing canvas restoration and full-story snapshot
  readiness.
- Old project/schema fixtures and publication compilation.

### Viewer regression tests

- Full `StoryViewer` output remains unchanged for every chapter type.
- Focused and full rendering use identical assets and layer presentation.
- Legacy-default cameras auto-fit after data loads; non-default authored cameras
  are not overridden.
- Programmatic chapter selection does not report a user camera edit.
- Interactive map errors, attribution, provenance, temporal controls, terrain,
  buildings, overlays, and legends remain available.
- Standalone, embedded, static, and archival publication builds remain valid.
- Flyover overlays compile and render in focused and full-story paths.

### Accessibility review

- Logical heading order and landmark ownership in all three regions.
- Keyboard chapter selection, reordering, disclosure, picker use, map toolbar,
  and responsive tabs.
- Visible focus and focus return after panels close.
- Status conveyed with words and icons, not only color.
- Inline errors associated with their fields.
- `aria-live` kept polite for camera and save updates.
- Touch targets and zoom behavior at 390px.
- Reduced-motion camera and UI alternatives.

### Manual workflow matrix

Exercise at 1440, 1024, 768, and 390 pixels:

1. Create and edit a prose chapter.
2. Select a map chapter, move the camera, wait for update, Undo, save, reload,
   and confirm the camera.
3. Change a chapter source, Fit to data, and confirm incompatible terrain is
   explained and disabled.
4. Add, reorder, remove, and replace overlays.
5. Edit shared source appearance and confirm every referencing chapter changes
   while the UI clearly states the scope.
6. Create image, video, chart, guided-map, and flyover chapters.
7. Build and scrub a flyover using captured views and presets.
8. Recover from an unavailable source and a save failure.
9. Switch repeatedly between focused chapter and full story preview.
10. Preview, run publication checks, and export connected and portable outputs.
11. Open Publish from a focused chapter, confirm the full story becomes the
    visible snapshot canvas, capture all map-bearing chapters and the share
    card, close Publish, and confirm the previous chapter/mode is restored.

### Required commands

```sh
yarn check:ui
yarn typecheck
yarn test
yarn build
yarn storybook:build
```

Run focused workspace tests during each PR, then the complete suite before the
final PR is ready for review.

## Risks and mitigations

### Map runtimes become duplicated or expensive

Mount only the active canvas, lazy-load map-bound focused previews, and avoid
keeping the full story viewer hidden behind the selected chapter canvas. The
publication workshop deliberately replaces the focused canvas with the visible
full story for capture, then restores the prior mode.

### Camera movement creates noisy project edits

Use comparison tolerances, commit on settled interaction, cancel stale timers,
ignore programmatic movement, and keep a one-step Undo.

### Reader and editor rendering drift

Factor rendering inside the viewer package and make both `StoryViewer` and
`FocusedChapterViewer` consume it. Do not build editor-only map layers.

### Shared source edits still appear chapter-local

Remove their controls from the chapter inspector, require explicit navigation
to Source details, show usage count, and repeat the shared-scope message beside
the editable fields.

### `App.tsx` extraction causes a high-risk rewrite

Extract one feature boundary at a time with characterization tests. Keep state
and mutations in `App.tsx` until the leaf component contract is stable; move
logic into pure helpers or hooks only when ownership is clear.

### Flyover captions broaden persisted contracts

Treat captions as optional reader content and update project schema,
publication schema, compiler, viewer, and archival fallback in the same PR.
Default the field for old v1 projects and verify round-trip compatibility.

### Responsive tabs hide errors or unsaved state

Keep global Save and publication status in the top bar at every width. Add an
issue marker to the relevant tab and route validation actions to the affected
region.

### Focused compilation diverges from publication compilation

Delegate to `compileProject`, prune only unrelated chapters/sources, and use a
dedicated browser-safe package subpath. Prefer an existing full manifest, run
the focused fallback only after full compilation fails, and apply one shared
asset-resolution helper to both results.

### Legacy maps change framing after the reader refactor

Preserve automatic fit for the exact legacy-default pose and make every other
camera authoritative. Give authors an explicit **Use fitted view** action to
turn a legacy automatic composition into a stored authored composition.

## Explicit non-goals

- No frontend framework or styling-system migration.
- No replacement of MapLibre, deck.gl, or the existing publisher/compiler.
- No hosted Storybook or mandatory visual-regression service.
- No chapter-level source-presentation override system.
- No account, cloud, or collaborative editing model.
- No redesign of reader themes beyond the internal renderer extraction needed
  for focused previews.
- No schema v2 unless a future breaking project-format change is independently
  approved.
