# Reader palettes and illustrated scenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editable layered illustrations with scroll animation to both preview and publications.

**Architecture:** Version project/publication contracts together. A pure scene sampler and shared viewer component drive focused previews, reader scrolling, and static fallback; compiler resolves all asset dependencies.

**Tech Stack:** TypeScript, React, Zod, Vite, Vitest, Testing Library, existing Yarn workspace packages; OpenAI HTTP APIs only in the generation stage.

**Design:** [Approved design](../specs/2026-11-19-ai-story-creation-design.md). Status: ready for plan review, not implemented.

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

### Task 1: Define versioned palette and scene contracts

**Files:** Create packages/story-schema/src/illustration.ts and illustration.test.ts; modify project.ts, publication.ts, index.ts, schema.test.ts, publication.test.ts.

**Interfaces:** Export ReaderPalette, SceneDefinition, SceneLayer, SceneKeyframe and their Zod schemas. Project illustrated layers use sourceId; compiled layers use assetId. Add v3 migration readers while preserving v1/v2 parsing.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```ts
expect(
  sceneKeyframeSchema.safeParse({
    at: 2,
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
    reveal: 1,
  }).success,
).toBe(false);
expect(
  sceneKeyframeSchema.safeParse({
    at: 0,
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
    reveal: 1,
  }).success,
).toBe(true);
```

Add migration fixtures for prose, maps and flyovers; reject duplicate IDs, unsorted keyframes, missing layer references, excessive counts, external path references, and unknown script/style fields. Assert round-trip persistence of every scene field.

- [ ] Run `yarn test packages/story-schema/src` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```ts
export type SceneKeyframe = {
  at: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  reveal: number;
};
export type ReaderPalette = {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  accent: string;
  accentText: string;
};
```

Define strict discriminated layers: image(sourceId, alt), text(text, fontSize, colorRole), path(pathData, fillRole, strokeRole, strokeWidth). Common fields: id, x, y, width, height, opacity, keyframes. Coordinates use normalized canvas space; scale is bounded 0.01–10, opacity/reveal/progress 0–1. SceneDefinition has width, height, layers, staticProgress, motionStrength, scrollLength. Restrict pathData to parsed SVG path commands and finite numbers, with a 64 KiB limit per path; no raw markup. Use strict Zod objects. Keep legacy fields/defaults intact in migrations.

- [ ] Run `yarn test packages/story-schema/src` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `feat: define versioned illustrated story contracts`.

### Task 2: Implement deterministic sampling and shared rendering

**Files:** Create packages/viewer/src/sceneFrame.ts, sceneFrame.test.ts, IllustratedChapter.tsx, IllustratedChapter.test.tsx, illustrated.css; modify PublicationChapterRenderer.tsx, StoryViewer.tsx, AtlasStoryViewer.tsx, index.ts.

**Interfaces:** sceneFrame(scene: SceneDefinition, progress: number): SceneFrame; SceneFrame is an array of {id,x,y,scale,opacity,reveal}. IllustratedChapter receives a compiled chapter, resolved assets, snapshotMode, and optional previewProgress.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```ts
// Two frames at 0 and 1, with x=0 and x=1 respectively.
expect(sceneFrame(scene, 0.5)[0].x).toBeCloseTo(0.5);
expect(sceneFrame(scene, -1)).toEqual(sceneFrame(scene, 0));
expect(sceneFrame(scene, 2)).toEqual(sceneFrame(scene, 1));
```

Test exact endpoints, empty tracks, resize, nested scroll root, reduced motion, snapshotMode, missing images, and narrative/alt availability. Frozen-time snapshots must be deterministic.

- [ ] Run `yarn test packages/viewer/src/sceneFrame.test.ts packages/viewer/src/IllustratedChapter.test.tsx` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```ts
const t = Math.max(0, Math.min(1, progress));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
// Locate adjacent keyframes bracketing t; clamp outside the track.
// Interpolate each numeric property. Blend against staticProgress by motionStrength.
```

Render image, text, and path elements from validated data. Use a normalized SVG viewBox with raster image assets referenced by compiler-resolved URLs. Text remains text nodes. Scope generated palette variables to reader roots. Compute scroll progress from the actual containing scrollport's geometry; use one animation-frame update per scroll event batch and clean up listeners. staticProgress overrides progress for snapshot/reduced motion. A scrubber in focused mode supplies previewProgress instead of scrolling the editor.

- [ ] Run `yarn test packages/viewer/src/sceneFrame.test.ts packages/viewer/src/IllustratedChapter.test.tsx` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `feat: render scroll-driven illustrated chapters`.

### Task 3: Compile and publish scenes with full asset closure

**Files:** Modify packages/publisher/src/compile.ts, compileValidation.ts, preflight.ts, build.ts, archive.ts, compile.test.ts, compileValidation.test.ts; modify apps/editor/src/captureSnapshots.ts; add illustrated fixture under fixtures/.

**Interfaces:** Compiler emits v3 manifests, transforms every layer sourceId to assetId, and registers all dependencies. Publication validation checks reference closure before promotion.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```ts
expect(compiled.chapters.find((c) => c.type === "illustrated")?.type).toBe(
  "illustrated",
);
expect(compile(project)).toEqual(compile(project));
```

Extend fixtures to prove missing layer assets block compilation, included assets appear in the dependency inventory, offline output makes zero external requests, archive captures staticProgress, and a failed scene build leaves previous publication bytes untouched.

- [ ] Run `yarn test packages/publisher/src` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```ts
// Within the illustrated chapter compile branch:
const layers = chapter.scene.layers.map((layer) => {
  if (layer.kind !== "image") return layer;
  const { sourceId, ...rest } = layer;
  return { ...rest, assetId: sourceId };
});
```

Use existing asset resolution for source identity and URLs; never copy arbitrary model paths. Extend all exhaustive chapter switches, schema migrations, export/capture paths, and preflight reports. Contrast warnings use resolved palette pairs; candidate generation later treats them as validation failures. Preserve normal existing publication warnings and policy.

- [ ] Run `yarn test packages/publisher/src` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `feat: compile illustrated scenes into verified publications`.

### Task 4: Expose normal authoring controls and fixtures

**Files:** Create apps/editor/src/IllustrationInspector.tsx, IllustrationInspector.test.tsx, IllustrationInspector.stories.tsx, ReaderPaletteEditor.tsx and tests; modify ChapterInspector.tsx, ChapterCanvas.tsx, App.tsx and chapter-creation controls discovered via rg; update docs/design/patterns.md and docs/publication.md.

**Interfaces:** IllustrationInspector({chapter,onChange}) edits the persisted illustrated chapter. ReaderPaletteEditor({value,onChange}) updates publication.palette. Reuse existing image upload/import authority.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```tsx
await user.clear(screen.getByLabelText("Alternative description"));
await user.type(
  screen.getByLabelText("Alternative description"),
  "A river reaching the sea",
);
expect(onChange).toHaveBeenLastCalledWith(
  expect.objectContaining({ alt: "A river reaching the sea" }),
);
```

Cover artwork replacement preserving layer/keyframe IDs, label editing, motionStrength zero, save/reopen persistence, and chapter reorder. Storybook covers absent/missing artwork, loading, errors, disabled controls, focus, narrow display, and reduced motion.

- [ ] Run `yarn test apps/editor/src/IllustrationInspector.test.tsx apps/editor/src/ReaderPaletteEditor.test.tsx` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```tsx
<input
  type="range"
  aria-label="Motion strength"
  min={0}
  max={1}
  step={0.05}
  value={chapter.scene.motionStrength}
  onChange={(e) =>
    onChange({
      ...chapter,
      scene: {
        ...chapter.scene,
        motionStrength: Number(e.currentTarget.value),
      },
    })
  }
/>
```

Use shared UI equivalents in production code. Expose caption, alt, layer text and image replacement, scroll length, static preview scrubber, and palette roles. Add an Illustrated scene chapter option with a valid blank composition. Do not introduce a general animation timeline UI.

- [ ] Run `yarn test apps/editor/src/IllustrationInspector.test.tsx apps/editor/src/ReaderPaletteEditor.test.tsx` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `feat: edit illustrated chapters and reader palettes`.

## Final verification and handoff

- [ ] Run `yarn typecheck`, `yarn test`, `yarn check:independence`, `yarn check:ui`, `yarn format:check`, `yarn build`, `yarn build:publication`, and `yarn storybook:build`.
- [ ] Run additional publishing/runtime checks specified below. Exercise the user journey in a browser with disposable projects; record actual outcomes.
- [ ] Update maintained domain guidance and Storybook fixtures. Use the PR template and identify checks as passed, failed, or not run with a reason.
- [ ] Push the focused branch and open a PR; attach it to this chat. Check CI and review feedback, fix sound findings, and leave the PR unmerged.

- [ ] Also run `yarn test:publishing:no-git` and `yarn test:offline-runtime`. Verify the same fixture in focused canvas, full reader, built publication, and archival export.
