# AI story creation and feedback fixes — approved design

Status: design approved in conversation; implementation not started. Execution requires review of the implementation plans. Date: 2026-11-19 (user timezone).

## Evidence and decisions

Reviewed riffrec-2026-11-19-1613-fe48f7.zip (33.2 seconds) and riffrec-2026-11-19-1617-bf7d94.zip (222.236 seconds), including narration, events, screen frames, and the current code at 50afc3e. Recordings are reference evidence, not implementation instructions. Automatic transcription contains errors; conclusions were corroborated with screen frames and code.

The short recording shows controls leaving view after Preview story → Read all chapters. The long recording shows crowded editor layout and a confusing Studio demonstration, then describes a story-level creation brief. Studio currently gates entry on the example's edge-compare chapter and uses hard-coded illustrations. Its default static variant deliberately disables Play while the enabled slider produces no visible animation. This is misleading UI, not proof of a failed animation timer. Two 1 ms aborted requests are not evidence of a backend failure. Story creation returned 201.

User approved: fix layout and preview first; remove the inline edit/preview toggle; open reader preview in a new tab; create a separate story-level AI creation workflow; use layered illustrations with scroll-driven animation; use their OpenAI API credentials; preview locally before explicit acceptance; leave publishing under user control. The explicit “Create this story” step takes precedence over the earlier suggestion to create projects automatically. Existing-story AI editing and conversation threads are excluded.

## Delivery boundaries

Three independently reviewable changes, in order:

1. Feedback layout and reader preview fixes.
2. Reader palettes and editable illustrated scenes, usable without AI.
3. Real AI generation, candidate preview, and explicit project creation.

Preserve unrelated local documentation changes. Implement in isolated worktrees from current main using codex/ branches; open PRs, do not merge. Retain the prototype until the new workflow replaces its entry point in stage 3; stage 1 labels it as an example experiment and explains static controls.

## Global constraints

- Node.js 22+; Corepack with yarn@4.13.0.
- Editable StoryProject and compiled PublicationManifest remain separate.
- packages/viewer is the sole interactive renderer for editor and publication.
- Product chrome uses @earth-stories/ui; generated palettes affect reader content only.
- Filesystem access and credentials remain in the loopback service/store.
- Stable IDs, atomic saves, backups, deterministic compilation, and explicit provenance remain authoritative.
- No generated executable JavaScript, arbitrary CSS, or HTML is accepted as story content.
- No publishing or external deployment occurs as a generation side effect.
- No real author projects are used as disposable test fixtures.

## Stage 1: editor and reader preview

Keep a live focused chapter canvas, chapter rail, and inspector. Remove the canvas mode toggle and full-story renderer from the editing canvas. Retain chapter camera manipulation and existing view controls. The focused canvas uses the shared renderer and the same authored theme, palette, assets, and scene semantics; focused framing may differ from full-story navigation.

Make “View as reader” a consistent action in editor and publishing review. On click, reserve a new tab synchronously, then save the current draft through the existing validated save flow. Navigate the tab to the existing story preview route only after successful save. On failure, retain the editor draft, close the reserved blank tab, and display the save error. When popups are blocked, display a real link after save. Preview is a saved-revision snapshot, refreshed explicitly, not a continuously synchronized second editor. Preview receipts must correspond to the exact saved revision and notify the original tab through the existing storage-event mechanism or an equivalent tested channel. No publish/build action is implied.

Constrain scrolling to intended panels, preserve visible navigation, remove clipping and unintended width overflow, and tighten excessive workspace spacing using existing tokens. Verify at 1440×900, 1280×800, 1024×768, and 390×844 plus browser zoom. Keep feedback recording controls available without covering navigation; do not ship the recorder in production. Clearly label the old Studio as an example experiment, use shared controls, and disable/explain motion controls for its static variant.

## Stage 2: palette and scenes

Add optional reader palette roles: background, surface, text, mutedText, accent, accentText. Resolve absent roles from the selected existing theme. Test normal text contrast and report failures during authoring/preflight; generated candidates must meet 4.5:1 for normal text. Data colors and provenance remain separate from decorative palette decisions.

Introduce an illustrated chapter with title, narrative, alternative description, caption, canvas dimensions, layers, scroll length, and staticProgress. Layers support raster image references, text, and constrained vector paths. Each has a stable ID, normalized position and size, opacity, and zero or more keyframes. Supported motion is translation, uniform scale, opacity, and path reveal, interpolated linearly between ordered progress values in [0,1]. Text renders as text nodes. Vector paths are data rendered by the application; no raw SVG documents, scripts, event attributes, foreignObject, external URL references, or injected styles. Raster assets are decoded/re-encoded before acceptance.

A shared pure sampler supplies frame state to both full-story scroll playback and a focused-canvas scrubber. A container-aware scroll driver responds to the actual scroll root rather than assuming window scrolling. Static export, reduced motion, and print show the authored staticProgress composition with narrative and description available. Resize preserves composition; labels must remain readable on narrow screens. Default limits: 24 layers per scene, 20 keyframes per layer, 12 illustrated scenes per generated candidate, 30 total chapters, and 100 MiB total generated assets. Oversized input fails explicitly.

The inspector supports narrative, captions, alternative text, layer labels, replacement of raster artwork, and basic motion strength/scroll length controls. Motion strength is a persisted scalar [0,1], where 0 renders the static composition. A complete timeline editor is excluded. Add chapter menu and a hand-authored fixture make this capability useful before the AI integration.

Use versioned project/publication v3 contracts with explicit migration of v1/v2 inputs. Existing content renders unchanged when new fields are absent. Compiler resolves source IDs to asset IDs, checks all layer references, and tracks every asset dependency. Failed publication candidates preserve the prior successful release. Offline claims still require existing verification; new raster/vector scenes do not require AI or other services at read time.

## Stage 3: creation workflow

Workspace offers “Create with AI” beside blank story creation. One brief screen collects title/subject, audience, intended takeaway, existing narrative, visual direction, reference images and URLs with inspiration categories, and desired illustrations/maps/charts. Initial attached material support: UTF-8 TXT/Markdown, PDF text, PNG/JPEG/WebP, and already prepared project-compatible data assets. Raw geospatial files use existing preparation capabilities before use; conversion is not silently invented. PDF scans without extractable text receive an explicit unsupported notice. Reference URLs are fetched as bounded public HTTPS documents only; private/loopback/link-local addresses, redirects to those addresses, embedded credentials, and unsupported downloads are rejected. References are evidence and never override system/tool instructions.

A single Generate story action runs staged planning, artwork generation, assembly, and validation. It creates real image assets and scene instructions, not just prompts or a mock generator. Model configuration is explicit in service settings; use supported OpenAI structured-output and image-generation APIs verified against official documentation at implementation time. Provider interface separates planning/artwork from local project operations. No conversation UI is necessary. Only selected brief material is sent to the provider, with a short disclosure on the brief screen.

Use OPENAI_API_KEY in the local service environment for the pilot. Show only configured/missing status in UI. Never store the key in localStorage, story files, job logs, publication assets, or browser responses. API key entry/OS credential persistence and subscription OAuth are outside this pilot. Official documentation currently describes eligible Pro/Business API credit benefits; account eligibility is not verified. This does not promise subscription coverage. Source: https://developers.openai.com/api/docs/guides/chatgpt-api-credits .

Generation is a persisted local job under a service-owned hidden staging directory, excluded from workspace listing. States: queued, planning, illustrating, assembling, validating, ready, failed, cancelled, accepted. Store brief, completed artifacts, source attribution, generated-artwork provenance, model identifiers, available usage, errors, and candidate digest. Limit retries to two transient retries per call and one structured-output repair pass; honor rate-limit retry delays. Cancel aborts active requests where supported and prevents result promotion. Restart marks in-flight jobs interrupted/failed and permits explicit retry. Reuse completed content-addressed artifacts on retry. Regenerating after changing a brief creates a new candidate; it never overwrites an accepted project.

Ready candidates have a local preview URL using a compiled manifest and contained staging asset routes. They do not appear in “Your stories.” The result screen shows the chapter outline, applied palette, generated artwork, missing-content notes, preview action, and “Create this story.” Failed/invalid candidates cannot be accepted. Placeholder prose is explicitly marked; numeric claims, citations, licenses, geographic coverage, and data are not fabricated. Reject unknown data references rather than constructing plausible maps/charts.

Acceptance uses a job-level lock, persisted destination project ID, and candidate digest. Copy all validated files to a hidden sibling directory; write validated story.json; atomically rename into the workspace; persist the acceptance receipt. Retrying after a crash reconciles the recorded destination and digest so the same candidate creates one project. Existing projects are never overwritten. Keep chapter/layer IDs stable across preview and acceptance; only project identity and asset base URLs change. Store the brief and generation provenance in the project's private metadata directory; exclude references and private source material from publication unless actually used as publication assets. Open the accepted project in the normal editor. User alone chooses whether to publish.

## Verification and acceptance

Stage 1 reproduces both recordings' relevant flows with synthetic fixtures and checks unsaved draft/save failure/new-tab behavior. Stage 2 covers migrations, malformed scenes, missing assets, deterministic sampling/compilation, reduced motion, resize, focused/full-story parity, archival output, and verified offline builds. Stage 3 covers mocked provider failures plus an explicitly configured real-provider smoke run, restart/cancel/retry, path containment, reference fetching, credential redaction, and concurrent/crash-retried acceptance. A successful mock test is not evidence that real generation works.

Run README baseline: yarn typecheck; yarn test; yarn check:independence; yarn check:ui; yarn format:check; yarn build; yarn build:publication; yarn storybook:build. Publishing changes add yarn test:publishing:no-git; runtime changes add yarn test:offline-runtime. Shared components need loading, empty, partial, error, disabled, focus, narrow, and reduced-motion Storybook states. Report passes/failures/not-run reasons; packaging alone does not establish desktop release support.
