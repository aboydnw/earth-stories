# Production Proof and Desktop Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove a real GitHub Pages publication can continue into GeoLibre and make the macOS desktop pilot verifiable, privacy-explicit, and repeatable.

**Architecture:** A deterministic production fixture exercises the normal publisher, a hosted probe validates the deployed HTTP contract, and the Pages workflow deploys only from `main`. Desktop hardening fixes the map-readiness race, verifies an unpacked application through its real Electron smoke boundary, and records automated and manual pilot evidence separately.

**Tech Stack:** TypeScript, Vitest, React Testing Library, Vite, Electron, Playwright/Electron smoke scripts, GitHub Actions and Pages.

## Global Constraints

- Authoring remains local; no hosted authoring API is introduced.
- No publication or evidence file may contain credentials, private-network URLs, capability tokens, or unpublished local paths.
- GitHub Pages deployment runs only on `main` or manual dispatch, never for pull-request code.
- The initial supported pilot target is macOS arm64 and x64; Windows and Linux remain provisional.
- Signing, notarization, quarantine, upgrade, rollback, uninstall, and clean-machine claims require manual evidence.
- Every behavioral production-code change starts from a focused failing test.

---

### Task 1: Structured GeoLibre Publication Evidence

**Files:**
- Modify: `packages/publisher/src/geolibre.ts`
- Modify: `packages/publisher/src/build.ts`
- Modify: `packages/publisher/src/geolibre.test.ts`
- Modify: `packages/publisher/src/publication.test.ts`

**Interfaces:**
- Consumes: `GeoLibreCompanionResult`, `PublicationManifest`, materialized publication assets.
- Produces: `GeoLibreCompanionResult.included` entries with `{ assetId, label, publicUrl }`, stable exclusions, and a report section rendered from that result.

- [ ] **Step 1: Write failing report and companion-result tests**

Add literal assertions proving that a deployed publication report names an included layer and public URL, names an unsupported referenced layer with `unsupported-format`, preserves an XYZ template, and renders no GeoLibre section after opt-out.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `yarn vitest run packages/publisher/src/geolibre.test.ts packages/publisher/src/publication.test.ts`

Expected: FAIL because the result exposes only `includedAssetIds` and the HTML report has no GeoLibre evidence section.

- [ ] **Step 3: Implement structured evidence and HTML rendering**

Replace the ID-only result with:

```ts
included: Array<{
  assetId: string;
  label: string;
  publicUrl: string;
}>;
```

Pass the result into publication report generation and render escaped included and excluded lists, the launch URL, and the `cors`/`byte-ranges` requirements. Keep the empty/disabled path absent.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `yarn vitest run packages/publisher/src/geolibre.test.ts packages/publisher/src/publication.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/publisher/src/geolibre.ts packages/publisher/src/build.ts packages/publisher/src/geolibre.test.ts packages/publisher/src/publication.test.ts
git commit -m "feat: report GeoLibre publication evidence"
```

### Task 2: Repository-Owned Production Fixture and Hosted Probe

**Files:**
- Create: `fixtures/geolibre-production-proof/story.json`
- Create: `fixtures/geolibre-production-proof/data/field-sites.geojson`
- Create: `scripts/build-geolibre-production-proof.ts`
- Create: `scripts/probe-hosted-publication.ts`
- Create: `scripts/probe-hosted-publication.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: final publication base URL, fixture project directory, `buildLatestPublication`.
- Produces: static output directory and `hosted-publication-evidence.json` with `{ version, publicationUrl, checkedAt, checks, failures }`.

- [ ] **Step 1: Write failing hosted-probe tests**

Start a controlled local HTTP server serving a hand-written publication, companion, GeoJSON response with `Access-Control-Allow-Origin: *`, and PMTiles-like response with `206` and `Content-Range`. Assert success, then independently assert named failures for missing CORS, ignored range requests, an unsafe companion URL, and a missing included asset.

- [ ] **Step 2: Run the probe tests and confirm RED**

Run: `yarn vitest run scripts/probe-hosted-publication.test.ts`

Expected: FAIL because `probeHostedPublication` does not exist.

- [ ] **Step 3: Implement the probe with injectable fetch**

Export:

```ts
export async function probeHostedPublication(options: {
  publicationUrl: string;
  fetch?: typeof globalThis.fetch;
  checkedAt?: string;
}): Promise<HostedPublicationEvidence>;
```

Validate public HTTPS in CLI mode, sanitize evidence URLs, request the manifest and companion, issue `Origin` and `Range: bytes=0-31` requests where applicable, and use stable check IDs such as `manifest`, `companion`, `cors:<assetId>`, and `range:<assetId>`.

- [ ] **Step 4: Add the deterministic fixture builder**

The builder accepts `--publication-url` and `--output`, copies the fixture into a temporary project, invokes the normal publisher, and verifies the result. The fixture includes an included GeoJSON, a connected XYZ template, and a referenced image layer that GeoLibre excludes as unsupported.

- [ ] **Step 5: Run probe and fixture tests and confirm GREEN**

Run: `yarn vitest run scripts/probe-hosted-publication.test.ts packages/publisher/src/publication.test.ts`

Run: `yarn geolibre-proof:build --publication-url https://example.org/earth-stories/production-proof/ --output /tmp/earth-stories-geolibre-proof`

Expected: tests pass and the output contains `publication.json`, `publication-report.html`, and `explore/story.geolibre.json`.

- [ ] **Step 6: Commit**

```bash
git add fixtures/geolibre-production-proof scripts/build-geolibre-production-proof.ts scripts/probe-hosted-publication.ts scripts/probe-hosted-publication.test.ts package.json
git commit -m "feat: add hosted GeoLibre production proof"
```

### Task 3: Pages Deployment and End-to-End Contract

**Files:**
- Create: `.github/workflows/geolibre-production-proof.yml`
- Create: `scripts/verify-geolibre-launch.ts`
- Create: `scripts/verify-geolibre-launch.test.ts`
- Modify: `package.json`
- Create: `docs/publication-geolibre.md`

**Interfaces:**
- Consumes: repository Pages base URL and deployed proof publication.
- Produces: a Pages artifact and a browser/HTTP launch-contract evidence file.

- [ ] **Step 1: Write failing launch-contract tests**

Given fixture HTML and a continuation URL, assert that verification finds one accessible `Open in GeoLibre` link, decodes its `url` parameter to the exact companion URL, rejects a mismatched host/path, and classifies an unavailable GeoLibre origin separately from a broken Earth Stories link.

- [ ] **Step 2: Run and confirm RED**

Run: `yarn vitest run scripts/verify-geolibre-launch.test.ts`

Expected: FAIL because the launch verifier does not exist.

- [ ] **Step 3: Implement the launch verifier**

Use the fetched publication manifest and rendered/static continuation contract rather than GeoLibre CSS selectors. Optionally probe `web.geolibre.app` and record `external-service-unavailable` separately; never make that optional probe determine whether Earth Stories produced the correct link.

- [ ] **Step 4: Add the Pages workflow**

The workflow has a PR-safe `build-proof` job and a `deploy` job guarded by:

```yaml
if: github.ref == 'refs/heads/main' && github.event_name == 'push'
```

It enables Corepack before setup-node caching, builds with the standard repository Pages URL, uploads through `actions/upload-pages-artifact`, deploys through `actions/deploy-pages`, then runs the hosted probe and launch verifier against the deployed URL. It uploads JSON evidence even when a probe fails.

- [ ] **Step 5: Document the hosting contract**

Document the canonical URL requirement, CORS behavior, byte ranges, opt-out, included/connected distinction, and the exact GitHub repository settings required after merge.

- [ ] **Step 6: Run and confirm GREEN**

Run: `yarn vitest run scripts/verify-geolibre-launch.test.ts scripts/probe-hosted-publication.test.ts`

Run: `yarn geolibre-proof:build --publication-url https://example.org/earth-stories/production-proof/ --output /tmp/earth-stories-geolibre-proof`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/geolibre-production-proof.yml scripts/verify-geolibre-launch.ts scripts/verify-geolibre-launch.test.ts package.json docs/publication-geolibre.md
git commit -m "ci: deploy and probe the GeoLibre production proof"
```

### Task 4: Offline Map Readiness Regression

**Files:**
- Modify: `packages/viewer/src/DeckOverlay.test.tsx`
- Modify: `packages/viewer/src/DeckOverlay.tsx`
- Modify: `scripts/verify-offline-runtime.ts`

**Interfaces:**
- Consumes: `useMap()` readiness and Deck/Mapbox overlay lifecycle.
- Produces: overlay initialization that never calls the adapter before the map exists and ignores updates after teardown.

- [ ] **Step 1: Write the failing lifecycle regression**

Render `DeckOverlay` with a map context whose map is initially null, rerender after providing the map, then unmount while a prop update is pending. Assert that construction and `setProps` happen only while the map is live and that no runtime error is emitted.

- [ ] **Step 2: Run and confirm RED**

Run: `yarn vitest run packages/viewer/src/DeckOverlay.test.tsx`

Expected: FAIL with construction or `setProps` occurring before readiness.

- [ ] **Step 3: Implement the readiness guard**

Keep the overlay instance in a ref, create it only after a non-null live map is available, remove it before clearing the ref, and gate prop updates on the same live instance. Preserve latest callback refs without recreating the overlay.

- [ ] **Step 4: Run unit and browser smoke checks**

Run: `yarn vitest run packages/viewer/src/DeckOverlay.test.tsx packages/viewer/src/MapChapter.test.tsx`

Run: `yarn test:offline-runtime`

Expected: PASS without `getProjection` on null.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/DeckOverlay.tsx packages/viewer/src/DeckOverlay.test.tsx scripts/verify-offline-runtime.ts
git commit -m "fix: wait for live maps before attaching deck overlays"
```

### Task 5: Installed-App Verification and Privacy Disclosure

**Files:**
- Create: `apps/desktop/scripts/verify-installed-app.mjs`
- Create: `apps/desktop/src/installed-app-verification.test.ts`
- Modify: `apps/desktop/smoke/electron-smoke.cjs`
- Modify: `apps/desktop/package.json`
- Modify: `apps/editor/src/PublishPanel.tsx`
- Modify: `apps/editor/src/PublishPanel.test.tsx`
- Modify: `apps/editor/src/editor.css`

**Interfaces:**
- Consumes: unpacked application path, isolated workspace/app-data paths, publisher preflight.
- Produces: `desktop-pilot-evidence.v1.json` and a pre-export privacy summary derived from real readiness data.

- [ ] **Step 1: Write failing verifier contract tests**

Invoke the verifier core with a temporary fake artifact tree and injected launcher. Assert named failures for missing packaged resources, source paths leaked into a publication, an unobserved GeoLibre external-link event, and a residual service; assert that evidence sanitizes workspace paths and query strings.

- [ ] **Step 2: Run and confirm RED**

Run: `yarn vitest run apps/desktop/src/installed-app-verification.test.ts`

Expected: FAIL because the verifier does not exist.

- [ ] **Step 3: Implement the verifier and extend the real smoke script**

Split pure evidence evaluation into an importable module used by the CLI. Extend the Electron smoke output with project create/save/reopen/publication, external GeoLibre navigation, and graceful shutdown observations. Run with temporary `userData` and workspace directories and delete them only after the evidence is written.

- [ ] **Step 4: Write failing privacy UI tests**

Assert that the publication panel distinguishes local working files, included publication copies, connected source URLs, and GeoLibre's public-URL-only access. Assert that disabling GeoLibre changes the summary without changing included/connected counts.

- [ ] **Step 5: Run and confirm RED**

Run: `yarn vitest run apps/editor/src/PublishPanel.test.tsx`

Expected: FAIL because the four-part privacy disclosure is absent.

- [ ] **Step 6: Implement the disclosure and confirm GREEN**

Render the summary beside release contents using `preflight.includedAssets`, `preflight.connectedAssets`, the real GeoLibre eligibility result, and the stored opt-out. Avoid claims about third-party connected hosts.

Run: `yarn vitest run apps/desktop/src/installed-app-verification.test.ts apps/editor/src/PublishPanel.test.tsx`

Run: `yarn workspace @earth-stories/desktop package:dir`

Run: `yarn workspace @earth-stories/desktop verify:installed --app apps/desktop/build/artifacts/linux-unpacked`

Expected: PASS and a versioned evidence file.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/scripts/verify-installed-app.mjs apps/desktop/src/installed-app-verification.test.ts apps/desktop/smoke/electron-smoke.cjs apps/desktop/package.json apps/editor/src/PublishPanel.tsx apps/editor/src/PublishPanel.test.tsx apps/editor/src/editor.css
git commit -m "feat: verify desktop pilot privacy and packaging"
```

### Task 6: macOS Pilot Protocol and Final Verification

**Files:**
- Create: `docs/release/desktop-platform-evidence.schema.json`
- Create: `docs/release/desktop-platform-evidence.example.json`
- Create: `docs/release/macos-pilot-protocol.md`
- Modify: `docs/release/desktop-release-readiness.md`
- Modify: `docs/desktop-application.md`

**Interfaces:**
- Consumes: automated evidence from Tasks 2, 3, and 5 plus human macOS observations.
- Produces: a versioned, reviewable macOS arm64/x64 release-candidate evidence record.

- [ ] **Step 1: Add the evidence schema and example**

Require artifact SHA-256, app version, commit, OS version, architecture, tester, automated evidence paths, and manual rows for signature, notarization, quarantine, install, local authoring, QGIS-exported data, publication, GeoLibre, offline boundary, accessibility, upgrade, rollback, uninstall, and workspace hashes before/after.

- [ ] **Step 2: Write the exact pilot protocol**

For every row specify prerequisites, commands or UI actions, expected result, evidence attachment, failure disposition, and whether it blocks distribution. Do not instruct testers to bypass Gatekeeper for a candidate described as signed.

- [ ] **Step 3: Reconcile release documentation**

Update readiness and desktop documentation to describe the Pages proof, installed-app verifier, macOS-first status, remaining signing/legal/manual gates, and exact manual GitHub and Apple configuration.

- [ ] **Step 4: Validate documents and all changed code**

Run:

```bash
yarn prettier --check .github/workflows/geolibre-production-proof.yml docs/publication-geolibre.md docs/release/macos-pilot-protocol.md docs/release/desktop-platform-evidence.schema.json docs/release/desktop-platform-evidence.example.json
yarn typecheck
yarn check:ui
yarn check:independence
yarn test
yarn build
yarn test:publishing:no-git
yarn test:offline-runtime
yarn workspace @earth-stories/desktop test
yarn workspace @earth-stories/desktop verify:resources
```

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add docs/release/desktop-platform-evidence.schema.json docs/release/desktop-platform-evidence.example.json docs/release/macos-pilot-protocol.md docs/release/desktop-release-readiness.md docs/desktop-application.md
git commit -m "docs: define the macOS desktop pilot protocol"
```

- [ ] **Step 6: Review and push PR #23**

Review `git diff origin/main...HEAD`, verify no local paths or secrets appear, push `codex/desktop-geolibre`, update the PR body with the new evidence and manual gates, and re-check GitHub status.
