# Illustration layers implementation plan

> **For agentic workers:** Use executing-plans to implement inline, task by task.

**Goal:** Prepare a supplied illustration as one editable, scroll-animated scene in an existing story, then preview and apply it without changing original content.

**Architecture:** Reuse the existing image-capable illustrated chapter and the shared scene renderer. Keep source assets in the project, use named layers and bounded motion, and retain the original artwork. Preparation is manual: upload the original and optional prepared transparent layers. ChatGPT can optionally suggest constrained motion for those layers.

**Tech stack:** TypeScript, React, Zod, existing project store and publication compiler.

## Global constraints

- One ready-for-review PR; no automatic publication or edits to real author projects.
- No SVG conversion, image-to-video, API keys, or general-purpose path editor.
- One supplied illustration and three to six independently editable image layers are the target experiment. A single image must remain a usable, honestly labelled starting point.
- Use existing UI tokens and shared viewer; retain reduced-motion and archival stills.
- Asset processing is service-owned, bounded, and cancellable. Preserve existing source provenance and do not invent authorship.

## Task 1: Editable layer controls (independent of preparation)

Files: `apps/editor/src/IllustrationInspector.tsx`, new `apps/editor/src/IllustrationLayerControls.tsx`, `apps/editor/src/illustrationLayerEditing.ts`, corresponding tests and Storybook fixtures.

- [ ] Add a stateful inspector test that changes image position, opacity and motion and confirms the resulting scene frame changes without changing source IDs. Verify failure before implementing.
- [ ] Add controls for image description/name, position, proportional size, opacity, reorder, removal and restrained motion presets. Keep current source replacement and label editing. Use the existing image `alt` as the named layer; no new persisted contract is needed.
- [ ] Position edits translate all existing keyframes by the same delta. Presets explicitly replace layer motion with two bounded frames; choosing still clears keyframes. Reject changes exceeding schema bounds. Preserve arbitrary existing motion until a preset is selected.
- [ ] Verify source identities and unaffected layers survive editing, and invalid numeric inputs cannot enter the project. Cover reduced-motion stills through existing viewer tests.

## Task 2: Manual artwork preparation and preview

The user clarified that automatic separation is not expected. Upload the original plus optional prepared full-canvas transparent layers; do not download a separation model.

Files: `IllustrationStudio.tsx`, `artworkScene.ts`, `illustrationStudio.css`, `App.tsx`, `api.ts`, `generation/artwork.ts`, `generation/routes.ts`, `generation/chatgpt-provider.ts`, and `story-schema/artworkMotion.ts`, with focused tests.

- [x] Add validated image preparation (20 MiB/file, 16 million pixels, 8192 edge limit), full-size normalized preview and a 512-pixel thumbnail. Reject markup and malformed images.
- [x] Add a studio under Story settings. Store uploads in memory until Apply; preserve the original upload in the local source library on Apply. Permit one whole-image scene or up to six manually prepared layers. Require matching full-canvas dimensions. Limit combined uploaded input to 60 MiB.
- [x] Compile a scene-only preview using the shared renderer. Offer desktop/narrow, scroll, scrubbed and still views. Preview uses a custom delivery profile without changing the authored publication profile or claiming verified offline delivery.
- [x] Add optional ChatGPT motion suggestion through the current subscription connection. Send only bounded thumbnails, direction and bounded story text; accept known layer IDs with displacement limited to 8% and scale 1–1.08. No asset generation, story edits, new API credentials, or executable output.
- [x] Support cancellation/disconnection, timeout and exclusive motion requests. Return clear errors and retain the local preview after failures.
- [x] Insert outside existing visual sequences and save via the ordinary project store optimistic-version and atomic-save path. Existing chapters and publication settings survive unchanged. Import failures may leave unreferenced files but cannot alter the story.
- [ ] Verify failure/cancellation, layer upload/reorder/edit, actual browser preview and save/reopen/publication with disposable projects.

## Task 3: Validation and delivery

- [ ] Add stable fixtures for loaded, empty, missing-image and narrow states.
- [ ] Run focused tests, typecheck, full tests, independence, UI, formatting, editor/viewer builds, publication and Storybook builds; run publishing/offline tests where relevant.
- [ ] Review diff, record limitations accurately, commit and open one ready-for-review PR.
