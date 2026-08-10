# Implementation plan: guidance, language, publish readiness, and provenance

Status: implemented
Backlog items: 1, 2, 3, and 10 in `docs/ux-improvement-backlog.md`

## Outcome

Implement one coherent guidance system that helps authors understand where they
are, recover from empty or blocked states, understand publication readiness,
and give readers trustworthy context for every visualization. Preserve the
current local-first project model, compiler authority, routes, export formats,
and viewer behavior.

## Architectural decisions

### 1. Derive workflow state; do not persist a wizard

The five workflow stages are a projection of the current project, not a new
workflow entity:

- **Story:** title is present; description remains a recommendation.
- **Chapters:** every chapter has the fields required to compile; missing
  narrative remains a recommendation unless the existing publication policy is
  deliberately tightened later.
- **Data:** complete when no chapter requires data, otherwise complete when all
  data-backed chapters resolve their referenced sources.
- **Preview:** available when the browser compiler can produce a manifest;
  “reviewed” is a session receipt for the last saved project revision.
- **Publish:** Ready, Needs review, or Blocked from the authoritative readiness
  findings and, when requested, server preflight.

Do not add step fields to `story.json`, prevent non-linear navigation, or make
Data mandatory for prose/media-only stories.

### 2. Create one environment-neutral readiness evaluator

Move structural and narrative checks into a pure module in the publisher
package. Both the browser editor and server preflight consume the same finding
contract. The server augments those findings with filesystem, remote-resource,
size, and portability checks.

This prevents the workflow cue, Publish menu, and publication workshop from
drifting into three validation systems. The compiler remains authoritative for
manifest validity.

Proposed API:

```ts
type ReadinessArea = "story" | "chapters" | "data" | "preview" | "publish";
type ReadinessSeverity = "error" | "warning" | "info";

interface ReadinessFinding {
  id: string;
  area: ReadinessArea;
  severity: ReadinessSeverity;
  message: string;
  resolution?: string;
  chapterId?: string;
  resourceId?: string;
}

interface AuthoringReadiness {
  manifest: PublicationManifest | null;
  findings: ReadinessFinding[];
  stages: Record<ReadinessArea, "complete" | "current" | "optional" | "blocked">;
}

deriveAuthoringReadiness(project: StoryProject): AuthoringReadiness
```

Server `PublicationPreflight` should continue to expose `ready`; its `issues`
adopt the compatible finding fields. Build/export code still refuses any error.

### 3. Cache server preflight by saved revision

Add an editor hook that loads preflight when the Publish menu or publication
workshop opens. Cache by `project.id`, `project.metadata.updated`, and publication
profile. Invalidate on a successful save or profile change. Do not run remote
HEAD requests on every keystroke.

While preflight is not loaded, show local readiness and “Run publication
checks.” Never show Ready based only on stale server results.

### 4. Treat preview review as ephemeral authoring state

Track the last reviewed saved revision in editor state (or a small
`sessionStorage` adapter keyed by project ID). Opening Preview records the saved
`metadata.updated` value. Any subsequent edit marks Preview “Review again.”
Do not add preview receipts to the project schema or publication manifest.

### 5. Extend provenance through the existing source pipeline

`ProjectSource` is the authoring source of truth and `PublicationAsset` is the
reader contract. Add optional structured provenance to the shared source base,
copy it during compilation, and render it from the publication asset. Keep
`attribution` for concise legal/map attribution and backwards compatibility.

Proposed source shape:

```ts
interface SourceProvenance {
  publisher: string | null;
  sourceUrl: string | null;
  licenseName: string | null;
  licenseUrl: string | null;
  dataUpdatedAt: string | null; // ISO date or datetime
  accessedAt: string | null; // ISO date or datetime
  staleAfterDays: number | null; // explicit author/source policy
  temporalCoverage: { start: string | null; end: string | null } | null;
  spatialCoverage: string | null; // reader-facing place/extent label
  transformations: string[]; // authored, ordered, plain-language
}
```

Active display filters are not duplicated into provenance. They remain derived
from `asset.presentation.filterProperty`, `filterValue`, raster band/rescale,
Zarr variable/selection, and other existing renderer settings. “Stale” is only
shown when both `dataUpdatedAt` and `staleAfterDays` are present; Earth Stories
must not invent freshness claims.

### 6. Separate product chrome from reader provenance

The shared UI package owns guidance/readiness product components. The viewer
package owns the reader-facing provenance disclosure and its editorial CSS.
Do not import Chakra/product UI into the standalone publication runtime.

## File-by-file changes

### Documentation

#### `docs/ux-improvement-backlog.md`

- Preserve the full researched idea list and prioritization.
- Link implemented items to this plan and later to the shipping devlog.

#### `docs/design/patterns.md`

- Add an **Authoring guidance** provisional pattern.
- Define non-linear stages, the single-next-action rule, optional Data behavior,
  and the precedence of save failures over ordinary guidance.
- Expand **Publishing** with Ready / Needs review / Blocked vocabulary.
- Expand **Map and reader controls** with concise attribution versus expanded
  provenance behavior.

#### `docs/design/components.md`

- Register `WorkflowGuide`, `GuidancePrompt`, and `ReadinessSummary` as shared
  product contracts after their API stabilizes.
- Record `VisualizationProvenance` as viewer-owned, not shared product chrome.

#### `docs/publication.md`

- Document which provenance fields enter the manifest and static outputs.
- Clarify that source freshness is author/source supplied, not automatically
  guaranteed by Earth Stories.

### Shared schema and compilation

#### `packages/story-schema/src/project.ts`

- Add `sourceProvenanceSchema` with nullable/defaulted fields.
- Add `provenance` to `sourceBaseSchema` with a complete default so every source
  kind receives backward-compatible values.
- Use bounded nonnegative integers for `staleAfterDays`, URL validation for
  license/source URLs, and ISO date/datetime validation without coercion.
- Keep the project schema identifier at v1 because the addition is optional and
  the parser already supplies defaults; add a migration only if strict parsing
  of stored projects proves incompatible in fixtures.

#### `packages/story-schema/src/publication.ts`

- Add the same normalized provenance object to `publicationAssetSchema`.
- Export inferred provenance types for publisher and viewer use.
- Keep `attribution` required-but-nullable to avoid breaking existing manifests.

#### `packages/story-schema/src/schema.test.ts`

- Verify an old v1 fixture without provenance still parses with defaults.
- Verify valid full and partial provenance.
- Reject unsafe URLs, negative freshness windows, and malformed dates.
- Confirm every discriminated source kind receives the shared provenance shape.

#### `packages/publisher/src/readiness.ts` (new)

- Extract compile-safe structural checks currently embedded in preflight:
  description, chapter title, narrative, image alternative text, broken source
  references, and missing required chapter data.
- Return stable IDs, areas, severities, resource/chapter IDs, messages, and
  resolutions.
- Catch compiler errors once and emit a Preview/Publish blocker.
- Add provenance recommendations: missing attribution/publisher, missing update
  date, and explicitly stale data. Keep provenance omissions warnings, not
  blockers, for the first release.
- Add table-driven unit tests for prose-only, valid data story, broken reference,
  warning-only, stale, and compilation-failure projects.

#### `packages/publisher/src/preflight.ts`

- Begin with `deriveAuthoringReadiness(project).findings` rather than rebuilding
  browser-safe checks.
- Append filesystem containment, missing-file, remote reachability, connected
  dependency, portability, and size findings.
- Deduplicate by stable finding ID.
- Continue computing `ready` from the final error set.

#### `packages/publisher/src/compile.ts`

- Copy normalized source provenance into every compiled publication asset.
- Derive nothing time-dependent here so builds remain deterministic.
- Ensure project digests naturally change when provenance changes.

#### `packages/publisher/src/index.ts`

- Export browser-safe readiness APIs without making editor code import the
  Node-only preflight implementation.
- If the package entry currently bundles Node modules together, add an explicit
  subpath export such as `@earth-stories/publisher/readiness`.

#### Publisher tests

- Update `compile.test.ts` to assert provenance survives compilation.
- Update `publication.test.ts` to assert local findings match preflight and that
  provenance warnings do not block builds.
- Verify static ZIP, folder, archival HTML, and embed manifests retain the same
  provenance values.

### Shared product UI

#### `packages/ui/src/ProductPatterns.tsx`

- Add `WorkflowGuide`: semantic `nav`/ordered list, clickable stages, complete,
  current, optional, and blocked states, and an accessible current-step label.
- Add `GuidancePrompt`: one sentence plus exactly one action; support neutral,
  warning, and danger tones without duplicating `StatePanel`.
- Add `ReadinessSummary`: Ready / Needs review / Blocked status, error/warning
  counts, and optional compact metrics.
- Keep routing callbacks and feature-specific copy outside the shared package.

#### `packages/ui/src/index.tsx`

- Export the three contracts and their types.

#### `packages/ui/src/styles.css`

- Add semantic styles using existing tokens only.
- Provide narrow layouts, visible focus, reduced-motion behavior, and no
  color-only status communication.

#### `packages/ui/src/Patterns.stories.tsx`

- Add complete, current, optional-data, blocked, loading-preflight, and narrow
  examples.
- Include long titles and multiple-digit issue counts.

#### `packages/ui/src/components.test.tsx`

- Verify ordered navigation semantics, keyboard activation, `aria-current`,
  status labels, warning/error counts, and the one-action contract.

### Editor architecture

#### `apps/editor/src/editorReadiness.ts` (new)

- Adapt publisher readiness into editor-specific stage labels and destinations.
- Implement deterministic next-action precedence:
  1. save/service failure;
  2. story blocker;
  3. active chapter blocker;
  4. unresolved required data;
  5. preview unavailable or needs review;
  6. server publication blocker;
  7. warning review;
  8. publish.
- Return action descriptors, not React elements, so logic is unit-testable.
- Never classify Data as incomplete solely because `project.sources` is empty.

#### `apps/editor/src/editorReadiness.test.ts` (new)

- Cover every precedence branch, prose-only stories, map chapters without a
  source, stale preflight cache, unsaved changes, and preview-reviewed state.
- Assert there is never more than one primary guidance action.

#### `apps/editor/src/usePublicationReadiness.ts` (new)

- Own cached server-preflight state: idle, loading, ready, error, and stale.
- Key results to project ID + saved update timestamp + profile.
- Expose `load`, `invalidate`, and the latest safe result.
- Cancel/ignore late responses when switching projects.
- Keep previously loaded information visible as stale during refresh, labeled
  accordingly.

#### `apps/editor/src/previewReceipt.ts` (new)

- Read/write the last reviewed saved revision in session storage.
- Gracefully fall back to in-memory state if storage is unavailable.
- Unit-test corrupt values, project switching, and revision mismatch.

#### `apps/editor/src/App.tsx`

- Replace inline `publicationResult` validation with the new browser-safe
  readiness result while retaining the existing preview asset-URL hydration.
- Mount `WorkflowGuide` below the top bar and above the rail/workspace grid.
- Map stage clicks to existing inspector modes and preview/publish actions;
  avoid adding routes in this pass.
- Mount one `GuidancePrompt` under the workflow guide.
- Load server preflight when the Publish menu opens, after save when necessary,
  or when the publication workshop requests refresh.
- Remove the current `disabled={!publication}` behavior from the entire Publish
  dropdown: Preview should remain selectable when possible, while Publish can
  open readiness details even when blocked.
- Rename menu actions to “See as a reader” and “Publish publicly,” with precise
  descriptions.
- Record a preview receipt when entering draft reader view; mark it stale after
  any project edit.
- Replace inline preview/data-library error paragraphs with `StatePanel` or the
  shared guidance pattern and a recovery action.
- Pass the cached preflight state and refresh callback into `PublishPanel` so it
  does not issue a duplicate request.
- Keep `App.tsx` as composition initially; do not combine this work with a broad
  editor decomposition. Extract only the new pure logic and hook.

#### `apps/editor/src/PublishMenu.tsx` (new)

- Extract the existing popover from `App.tsx` because readiness adds meaningful
  behavior and test surface.
- Render `ReadinessSummary`, chapter/source counts, last preview state, and the
  two outcome-oriented actions.
- Preview remains available for warning-only projects. Publish opens the
  workshop for blocked projects so authors can see and resolve findings; final
  build actions remain disabled by preflight.
- Implement menu keyboard behavior using the existing focus/dismiss pattern;
  add arrow-key navigation if not supplied by a library primitive.

#### `apps/editor/src/PublishMenu.test.tsx` (new)

- Cover idle/loading/ready/review/blocked/error states.
- Confirm Preview is not disabled by publication errors that still permit a
  draft manifest.
- Confirm blocked Publish opens issue details rather than silently doing
  nothing.
- Verify Escape, outside click, focus return, and accessible names.

#### `apps/editor/src/PublishPanel.tsx`

- Accept preflight state and a refresh function from the hook; remove its
  independent initial-fetch effect.
- Use Ready / Needs review / Blocked consistently with the menu.
- Group findings by error, warning, and information while preserving existing
  `PublicationFinding` rendering.
- Keep format/build buttons gated by `preflight.ready` and loading state.
- Add a completion region after successful output with the result, next action,
  and build ID where available.

#### `apps/editor/src/DataWorkspace.tsx`

- Replace “Your data library is empty” with an outcome-based state explaining
  that data is optional until a map/chart chapter needs it, plus Add data when a
  project exists.
- In `DataMapViewer`, add an authoring provenance summary using the same field
  labels as the editor form.
- Do not make workspace example provenance editable.

#### `apps/editor/src/SourceProvenanceFields.tsx` (new)

- Centralize the authoring form for publisher/source URLs, license, data update
  and access dates, freshness window, coverage, and transformation list.
- Use the shared form controls, field help, URL/date validation, and a
  collapsible “Source and provenance” section.
- Keep map styling fields in `App.tsx`; provenance is source metadata, not map
  presentation.

#### `apps/editor/src/SourceProvenanceFields.test.tsx` (new)

- Verify partial entry, clearing nullable values, transformation ordering,
  invalid URLs/dates, and accessible labels/help.

#### `apps/editor/src/editor.css`

- Reserve one grid row for the workflow guide without changing rail/workspace
  ownership.
- Style the Publish popover summary, completion region, and editor-local
  provenance composition with existing CSS variables.
- Update narrow breakpoints so the guide becomes a horizontally scrollable or
  compact ordered list and never covers the editor.
- Remove selectors made obsolete by extracted markup only after snapshot/manual
  comparison.

#### Editor Storybook and tests

- Extend `EditorPatterns.stories.tsx` with the Publish menu, workflow guide in
  editor chrome, outcome-oriented empty states, and provenance form.
- Add an App-level test fixture only for integration boundaries: stage routing,
  preflight invalidation after save, and preview receipt invalidation after edit.

### Reader and publication runtime

#### `packages/viewer/src/VisualizationProvenance.tsx` (new)

- Render an accessible `details` disclosure below each map/chart/media
  visualization.
- Summary: source label + concise freshness state.
- Expanded content: publisher/source link, license, update/access dates,
  temporal/spatial coverage, transformations, and active display filters.
- Use `<time dateTime>`, safe HTTP(S) links, semantic lists, and explicit
  “Not provided” only where omission matters; otherwise omit empty rows.
- Calculate stale state at render time from manifest values and the viewer's
  current date. Pass `now` as an injectable prop/helper input for deterministic
  tests.

#### `packages/viewer/src/provenance.ts` (new)

- Pure helpers to format provenance, derive active filter descriptions, and
  calculate current/stale/unknown freshness.
- Handle Zarr selections, raster bands/rescale, category/symbol filters, and
  overlay assets without renderer-specific branching in the component.

#### `packages/viewer/src/MapChapter.tsx`

- Keep the current compact map attribution overlay for legal visibility.
- Render `VisualizationProvenance` outside the map canvas so it is keyboard and
  screen-reader accessible and does not compete with legends/controls.
- Include primary and overlay assets without duplicate entries.

#### `packages/viewer/src/ChartChapter.tsx`, image/video rendering sites

- Reuse the same disclosure for every data/media visualization that has an
  asset; do not limit the contract to maps despite the initial UI focus.
- For media, omit map-filter rows and show only applicable provenance.

#### `packages/viewer/src/StoryViewer.tsx`

- Pass asset collections to the relevant visualization disclosure if the
  chapter component does not already own them.
- Avoid a story-global provenance appendix in the first pass; contextual
  disclosure is easier to connect to the visualization.

#### `packages/viewer/src/viewer.css`

- Add reader-theme-aware disclosure styling using viewer variables, not product
  UI tokens.
- Ensure visible focus, readable long URLs, print behavior, and reduced motion.
- Keep attribution visible in snapshots even when expanded provenance controls
  are omitted by snapshot mode.

#### Viewer tests and stories

- Add `provenance.test.ts` for filter/freshness formatting and boundary dates.
- Add component tests for missing, partial, full, stale, overlay, and unsafe-link
  provenance.
- Extend representative viewer fixtures to verify CNG/editorial themes, mobile,
  print/archive, and maps that fail to load while provenance remains readable.

### Static and archival outputs

#### `packages/publisher/src/archive.ts`

- Add source, license, freshness, coverage, transformation, and active-filter
  text to archival output beside each captured visualization.
- Escape all authored values and include links only for validated HTTP(S) URLs.
- Preserve provenance when the interactive map snapshot is unavailable.

#### `packages/publisher/src/embed.ts` and build templates

- No special provenance transformation should be necessary if they consume the
  manifest and current viewer runtime; add regression assertions rather than a
  second rendering path.

## Delivery sequence and PR boundaries

### PR 1: readiness contract and shared UI

- Pure readiness evaluator and server-preflight reuse.
- Shared workflow/readiness components and Storybook coverage.
- No editor behavior change yet.

Validation: schema, publisher, shared UI tests; typecheck; Storybook build.

### PR 2: editor guidance and language

- Workflow guide, next action, preview receipt, outcome-oriented empty states.
- Extracted Publish menu with cached preflight.
- Publication workshop consumes shared cache and gains completion state.

Validation: editor unit/integration tests, keyboard/manual navigation, back/forward
routes, save failure, offline local-service failure, responsive editor.

### PR 3: provenance contract and authoring

- Backward-compatible project/publication schema extension.
- Compiler propagation, provenance form, workspace summary, and warnings.
- Existing attribution remains untouched.

Validation: old fixture migration, round-trip save/open, all source kinds,
compile/preflight/export tests.

### PR 4: reader and archive provenance

- Viewer disclosure, freshness/filter helpers, archival output, themed CSS.

Validation: viewer tests, map failure fallback, snapshot/export formats,
standalone viewer build, print/mobile/keyboard review.

These PR boundaries can be committed to the same feature branch and combined in
one final pull request, but each boundary should remain independently buildable
and reviewable.

## Safety and regression controls

- Do not change route shapes, story/chapter IDs, project storage paths, or
  publication output names.
- Do not block publication for missing provenance in the first release.
- Do not remove existing attribution fields or map attribution overlays.
- Do not perform remote freshness checks during normal editing.
- Do not show cached preflight as current after a save/profile change.
- Keep preview rendering based on the same compiled manifest as publication.
- Keep final build authorization in server preflight; client status is guidance,
  not a bypass.
- Test old projects and examples before adding provenance defaults to fixtures.
- Use stable finding IDs so UI state and tests do not depend on message copy.

## Acceptance criteria

1. An author can identify the current/incomplete stage and reach its existing
   destination with one action.
2. The guide never requires Data for a story that has no data-backed chapter.
3. Empty and blocked states explain the outcome and expose one recovery action.
4. The Publish menu reports current readiness, counts errors/warnings, and never
   presents stale checks as current.
5. Preview remains usable for warning-only stories and Publish exposes blockers.
6. Server export still refuses every blocking preflight finding.
7. Old v1 projects load and publish without manual migration.
8. Authored provenance survives save, compile, preview, folder/ZIP/embed/archive,
   and reopen cycles.
9. Every visualization exposes applicable provenance even if its map or media
   source fails to render.
10. Missing provenance warns authors but does not block publication in the first
    release.
