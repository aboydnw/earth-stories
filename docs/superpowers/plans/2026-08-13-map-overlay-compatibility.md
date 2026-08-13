# Map Overlay Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep deck-backed data visible by falling back from globe to Mercator, expose deck rendering failures, and restore the baked-in CGAZ examples with working public PMTiles archives.

**Architecture:** `MapChapter` remains the single projection-policy boundary for story, scrolly, publication, and Data Workspace maps. `DeckOverlay` remains the single deck.gl integration boundary and forwards errors to each overlay's existing error callback. Example connections continue to feed all copied example stories, but pin the compatible source layer and archive-specific camera ranges.

**Tech Stack:** TypeScript, React, MapLibre GL, react-map-gl, deck.gl, PMTiles, Vitest, Testing Library.

## Global Constraints

- Preserve authored camera data; only the effective rendered projection changes.
- Preserve globe for maps whose active assets are all PMTiles, GeoJSON, or XYZ.
- Treat COG, GeoParquet, Zarr, trajectory, and COPC as Mercator-only renderers.
- Reuse the existing map hint and error presentation.
- Use the separate UNDP-hosted ADM0 and ADM1 CGAZ archives and pin source layer `admin`.
- Keep the replacement host explicitly documented as external.
- Do not add or restore a CI workflow.

---

### Task 1: Central projection compatibility policy

**Files:**

- Modify: `packages/viewer/src/MapChapter.tsx:137-143,586-665,818-827`
- Test: `packages/viewer/src/MapChapter.test.tsx` (existing visible-error contract)

**Interfaces:**

- Consumes: `PublicationAsset.kind` for the primary source and every overlay.
- Produces: `supportsGlobeProjection(asset: PublicationAsset): boolean` and an effective `globeEnabled` boolean used by the map projection and hint.

- [x] **Step 1: Write failing projection tests**

Update the `react-map-gl` test double to expose `props.projection?.type` on a
rendered map container. Add literal assertions that a COG primary source and a
trajectory overlay omit `globe`, while a PMTiles-only chapter retains `globe`;
assert the compatibility hint only for the two fallback cases. Directly assert
the full compatibility matrix: PMTiles, GeoJSON, and XYZ allow globe; COG,
GeoParquet, Zarr, trajectory, and COPC do not.

- [x] **Step 2: Run the focused test and verify RED**

Run: `yarn vitest run packages/viewer/src/MapChapter.test.tsx`

Expected: the deck-backed cases still expose `globe` and do not render the compatibility hint.

- [x] **Step 3: Implement the minimal central policy**

Add a module-level predicate:

```ts
export const supportsGlobeProjection = (asset: PublicationAsset) =>
  asset.kind === "pmtiles" || asset.kind === "geojson" || asset.kind === "xyz";
```

Derive:

```ts
const globeSuppressed =
  Boolean(chapter.camera.globe) && !mapAssets.every(supportsGlobeProjection);
const globeEnabled = Boolean(chapter.camera.globe) && !globeSuppressed;
```

Use `globeEnabled` for the Map projection and render the exact hint `Mercator is used because this dataset renderer does not support globe view.` when suppressed.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `yarn vitest run packages/viewer/src/MapChapter.test.tsx`

Expected: all MapChapter tests pass.

### Task 2: Deck error propagation

**Files:**

- Modify: `packages/viewer/src/DeckOverlay.tsx`
- Modify: `packages/viewer/src/CogOverlay.tsx`
- Modify: `packages/viewer/src/GeoParquetOverlay.tsx`
- Modify: `packages/viewer/src/ZarrOverlay.tsx`
- Modify: `packages/viewer/src/TrajectoryOverlay.tsx`
- Test: `packages/viewer/src/DeckOverlay.test.tsx`
- Test: `packages/viewer/src/MapChapter.test.tsx`

**Interfaces:**

- Consumes: each overlay's existing `(message: string) => void` callback.
- Produces: `DeckOverlay({ layers, onAfterRender?, onError? })`, where `onError` receives the deck error message.

- [x] **Step 1: Write failing adapter and visible-error tests**

Capture the `MapboxOverlay` constructor props in `DeckOverlay.test.tsx`, invoke
its `onError` first with `new Error("Deck layer failed")` and then after
rerender with a new callback, and assert only the current callback receives
the normalized message. Keep the existing `MapChapter.test.tsx` assertion that
an error callback message becomes the visible alert's `data-error-detail`.

- [x] **Step 2: Run focused tests and verify RED**

Run: `yarn vitest run packages/viewer/src/DeckOverlay.test.tsx packages/viewer/src/MapChapter.test.tsx`

Expected: `DeckOverlay` has no `onError` constructor property, so the new
adapter assertion fails.

- [x] **Step 3: Implement the shared error boundary**

Add an `onError?: (message: string) => void` property, store it in a ref, and initialize `MapboxOverlay` with:

```ts
onError: (cause: Error) =>
  onErrorRef.current?.(
    cause instanceof Error ? cause.message : "The data layer could not be rendered.",
  ),
```

Pass the existing overlay-level `onError` into every `DeckOverlay` use in COG, GeoParquet, Zarr, and trajectory components. Do not alter COPC, whose control already reports errors.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `yarn vitest run packages/viewer/src/DeckOverlay.test.tsx packages/viewer/src/MapChapter.test.tsx packages/viewer/src/TrajectoryOverlay.test.ts packages/viewer/src/CogLayer.test.ts`

Expected: all selected tests pass.

### Task 3: Restore CGAZ example sources

**Files:**

- Modify: `apps/local-service/src/examples.ts:71-92,287-312,351-386,752-779,840-866`
- Modify: `apps/local-service/src/example-assets/example-boundaries/tile-pyramid.csv`
- Modify: `apps/local-service/src/examples.test.ts`
- Modify: `docs/examples.md`

**Interfaces:**

- Consumes: the UNDP-hosted ADM0 and ADM1 PMTiles v3 archives.
- Produces: working `countries-pmtiles` and `regions-pmtiles` example connections and story copies with `presentation.sourceLayer: "admin"`.

- [x] **Step 1: Write failing example-contract tests**

Assert the two connection locators equal the reviewed UNDP URLs. For every PMTiles source copied into boundaries, rich-media, and storm-track, assert the corresponding locator and literal source layer `admin`. Assert ADM0 chapter zooms are no greater than 3 and ADM1 chapter zooms are between 4 and 5 where those sources are primary.

- [x] **Step 2: Run the example test and verify RED**

Run: `yarn vitest run apps/local-service/src/examples.test.ts`

Expected: old R2 locators and null source layers fail the new contract.

- [x] **Step 3: Update sources, cameras, statistics, and prose**

Use:

```text
https://undpngddlsgeohubdev01.blob.core.windows.net/admin/cgaz/ADM0.pmtiles
https://undpngddlsgeohubdev01.blob.core.windows.net/admin/cgaz/ADM1.pmtiles
```

Pin `sourceLayer: "admin"`. Keep ADM0 story cameras at zoom 3 or below;
move every chapter that displays ADM1, whether primary or overlay, to zooms 4–5.
Replace the ADM0 CSV values with its verified header counts: addressed tiles
`82`, unique tile entries `81`, and unique tile contents `79`, and update
narrative that names obsolete counts or zoom ranges. Document UNDP as the
external archive host while retaining geoBoundaries CC BY 4.0 attribution.

- [x] **Step 4: Run the example test and verify GREEN**

Run: `yarn vitest run apps/local-service/src/examples.test.ts`

Expected: all example tests pass.

### Task 4: Full verification and delivery

**Files:**

- Review all files modified by Tasks 1–3.

**Interfaces:**

- Consumes: all completed fixes.
- Produces: a verified commit on `codex/pages-without-git`, pushed to PR #17.

- [x] **Step 1: Format authored files and inspect the diff**

Run Prettier only on the changed authored files, followed by `git diff --check` and a manual diff review. Do not reformat vendored runtime assets or unrelated task notes.

- [x] **Step 2: Run full local verification**

Run:

```bash
yarn typecheck
yarn test
yarn build
yarn workspace @earth-stories/desktop build
yarn test:publishing:no-git
```

Expected: every command exits 0; existing bundle-size and jsdom CSS-parser warnings may remain informational.

- [ ] **Step 3: Commit the implementation**

Stage only the plan and implementation files and commit with:

```text
fix: keep map data visible across projections
```

- [ ] **Step 4: Push and confirm the pull request**

Push `codex/pages-without-git`, confirm the worktree is clean and synchronized, and verify PR #17 remains open with this branch as its head.
