# Editor layout and reader preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix recorded layout failures and open saved reader previews in a separate tab.

**Architecture:** Keep the focused renderer in the editor. Reuse the existing preview route and validated save path; reserve a tab before asynchronous saving to avoid popup blocking.

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

### Task 1: Extract reliable reader-preview orchestration

**Files:** Create apps/editor/src/openReaderPreview.ts and openReaderPreview.test.ts; modify apps/editor/src/App.tsx, routing.test.ts, previewReceipt.ts and its tests.

**Interfaces:** openReaderPreview(deps: PreviewDependencies): Promise<void>; dependencies expose reserveTab, saveDraft, previewUrl, showError, and showFallbackLink. saveDraft returns {id, revision}. Preview receipts refer to that saved revision.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```ts
// In openReaderPreview.test.ts, use vi.fn dependency mocks.
expect(reserveTab).toHaveBeenCalledBefore(saveDraft);
expect(tab.navigate).toHaveBeenCalledWith(previewUrl(saved.id));
// Separate failure case: rejected save preserves the draft and closes the blank tab.
expect(tab.close).toHaveBeenCalledOnce();
expect(showError).toHaveBeenCalled();
// Popup-blocked case: reserveTab returns null; successful save exposes an anchor.
expect(showFallbackLink).toHaveBeenCalledWith(previewUrl(saved.id));
```

Also test edits made while saving: the receipt must describe the saved snapshot, not a later draft. Cross-tab receipt updates must refresh readiness without marking a changed revision reviewed.

- [ ] Run `yarn test apps/editor/src/openReaderPreview.test.ts apps/editor/src/routing.test.ts` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```ts
export interface PreviewDependencies {
  reserveTab(): { navigate(url: string): void; close(): void } | null;
  saveDraft(): Promise<{ id: string; revision: string }>;
  previewUrl(id: string): string;
  showError(error: unknown): void;
  showFallbackLink(url: string): void;
}
export async function openReaderPreview(d: PreviewDependencies) {
  const tab = d.reserveTab();
  try {
    const saved = await d.saveDraft();
    const url = d.previewUrl(saved.id);
    if (tab) tab.navigate(url);
    else d.showFallbackLink(url);
  } catch (error) {
    tab?.close();
    d.showError(error);
  }
}
```

Integrate through existing project-save validation; sever the new tab's opener. Keep Draft/not published labeling. Do not trigger publication compilation/build endpoints merely to open preview. Use the existing browser-side preview compiler and tested receipt path.

- [ ] Run `yarn test apps/editor/src/openReaderPreview.test.ts apps/editor/src/routing.test.ts` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `fix: open reader previews without losing editor state`.

### Task 2: Remove canvas mode switching and correct layout

**Files:** Modify apps/editor/src/ChapterCanvas.tsx, ChapterCanvas.test.tsx, ChapterCanvas.fit.test.tsx, EditorShell.tsx, EditorShell.test.tsx, App.tsx, WorkspaceScreen.tsx, editor.css; update relevant stories.

**Interfaces:** ChapterCanvas renders only FocusedChapterViewer; remove CanvasMode and mode/onModeChange callers. View as reader delegates to Task 1 from both editor and publication review.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```tsx
expect(screen.queryByRole("button", { name: "Preview story" })).toBeNull();
expect(screen.queryByRole("button", { name: "Edit chapter" })).toBeNull();
expect(screen.getByRole("region", { name: "Chapter canvas" })).toBeVisible();
```

Preserve the existing camera fit/undo tests. Browser verification must check header visibility, inspector reachability, no horizontal page overflow, and chapter selection after scrolling at the four specified viewport sizes and 200% zoom.

- [ ] Run `yarn test apps/editor/src/ChapterCanvas.test.tsx apps/editor/src/ChapterCanvas.fit.test.tsx apps/editor/src/EditorShell.test.tsx` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```css
/* Apply to the canvas panel; account for optional experiment entry in its own row. */
.chapter-editor-shell__panel--canvas {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chapter-canvas {
  flex: 1;
  min-height: 0;
  height: auto;
}
```

Remove obsolete mode CSS. Audit the parent editor height chain and overflow before changing it; every scrollable child needs a bounded parent and min-height:0. Preserve compact editor tabs. Use existing spacing tokens for workspace density and inspector padding. Use the shared viewer's theme in focused chapters; retain map camera controls.

- [ ] Run `yarn test apps/editor/src/ChapterCanvas.test.tsx apps/editor/src/ChapterCanvas.fit.test.tsx apps/editor/src/EditorShell.test.tsx` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `fix: keep chapter editing layout stable`.

### Task 3: Clarify experiment and recording controls

**Files:** Modify apps/editor/src/StoryStudio.tsx, StoryStudio.test.tsx, StoryStudio.stories.tsx, storyStudio.css, App.tsx, devFeedback.tsx; update docs/design/patterns.md.

**Interfaces:** The existing prototype remains explicitly example-only until stage 3; its controls accurately describe whether motion is available.

- [ ] Add the following behavior tests in the named test files; use the existing fixture setup and record a failure before implementation.

```tsx
expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
expect(
  screen.getByRole("slider", { name: "Rehearsal position" }),
).toBeDisabled();
expect(screen.getByText(/choose an animated treatment/i)).toBeVisible();
```

Select an animated treatment and assert controls become usable; reduced motion still disables playback. Inspect recorder placement with keyboard focus and narrow viewport.

- [ ] Run `yarn test apps/editor/src/StoryStudio.test.tsx` and confirm the new behavior fails for the expected reason.
- [ ] Implement the following contract/algorithm at the named integration points.

```ts
const motionUnavailable = still || variant === "original";
// Use motionUnavailable for Play, slider, and keyframe controls.
// Render explanatory text for the static baseline, with a clear route to treatments.
```

Replace unstyled prototype buttons with established UI contracts. Label the entry “Example animation experiment”. Adjust only the development recorder wrapper so recording status/actions do not cover app navigation; retain DEV-only mounting and production stripping.

- [ ] Run `yarn test apps/editor/src/StoryStudio.test.tsx` again; resolve failures and run `yarn typecheck` after contract changes.
- [ ] Review the diff for unrelated edits; commit this task as `fix: explain static studio controls and recording state`.

## Final verification and handoff

- [ ] Run `yarn typecheck`, `yarn test`, `yarn check:independence`, `yarn check:ui`, `yarn format:check`, `yarn build`, `yarn build:publication`, and `yarn storybook:build`.
- [ ] Run additional publishing/runtime checks specified below. Exercise the user journey in a browser with disposable projects; record actual outcomes.
- [ ] Update maintained domain guidance and Storybook fixtures. Use the PR template and identify checks as passed, failed, or not run with a reason.
- [ ] Push the focused branch and open a PR; attach it to this chat. Check CI and review feedback, fix sound findings, and leave the PR unmerged.

No publication/runtime contract changes are intended in this stage. Reproduce short-recording navigation using the separate reader tab; the editing tab must retain its selected chapter and controls.
