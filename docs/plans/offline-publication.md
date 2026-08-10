# Implementation plan: verified offline publications

Status: proposed

Priority: highest user value

Depends on: shared dependency inventory described below

## Outcome

Add an **Offline** publication profile whose exported interactive story can be
served from a local static server and used with all external network access
blocked. The editor must never label a build offline merely because most data
was copied. A successful offline build has no connected manifest dependencies,
does not fetch a basemap, runtime, projection definition, video, terrain, or
data from the internet, and passes a network-isolated browser verification.

This is an offline-publication guarantee, not initially an offline-authoring
guarantee. An author may need a connection while downloading remote source data
into the release or provisioning a Pixi conversion environment. Once all
required inputs and tools are local, repeat builds work without a connection by
reusing persistent, content-addressed materializations keyed by an expected
digest. A repeat build verifies those bytes and compiles against their local
locators; it never silently falls back to the original remote locator.

## Scope

The first supported release should:

- add an explicit `offline` profile rather than changing the meaning of
  `portable`;
- include every compatible story asset and every browser runtime asset;
- use a bundled neutral map style with no remote tiles, fonts, sprites, or
  glyphs;
- block unsupported connected features with source- or chapter-specific
  resolution guidance;
- prove the completed publication works while outbound requests are denied;
- retain the folder, ZIP, archive, embed, PNG, and animated-capture outputs only
  when an artifact-specific verifier proves their promised contents are usable
  offline. Interactive folders, ZIPs, archives, and embeds receive isolated
  runtime checks; static image/capture outputs receive decode, dimension, frame,
  and integrity checks.

The first release does not promise offline authoring on a brand-new computer,
cache arbitrary XYZ pyramids, mirror a whole Zarr store, download global
terrain/building tiles, or turn YouTube/Vimeo chapters into local video files.
Those are separate capabilities with substantial storage, licensing, and
format implications.

## Architectural decisions

### 1. Define offline as a verified build property

`offline` is true only when the built manifest contains no requirement named
`network` and the isolated runtime check succeeds. The profile is an author
request; verification is the release fact.

Add a machine-readable guarantee to the publication manifest and verification
report:

```ts
type PublicationConnectivity = {
  requested: "connected" | "portable" | "custom" | "offline";
} & (
  | { state: "pending" }
  | { state: "verified"; verified: "connected" | "offline" }
  | { state: "failed"; reasonCode: string }
);
```

The dependency report should say **Verified offline** only after verification.
A candidate remains `pending` until the browser check succeeds. Verification
atomically rewrites `publication.json` to `verified` before candidate promotion;
a failed candidate is marked `failed` in its report and never replaces the prior
latest publication.

### 2. Version the changed contracts

Adding `offline` and allowing a bundled basemap changes what older readers may
assume. Introduce `earth-stories/project/v2` and
`earth-stories/publication/v2`; migrate v1 projects through
`parseStoryProject`. Keep the authoring basemap URL for ordinary preview and
connected builds, and add a publication setting for the offline basemap policy.

The publication basemap becomes a discriminated contract and participates in
the same dependency inventory and integrity rules as story assets:

```ts
type PublicationBasemap =
  | {
      delivery: "connected";
      id: string;
      label: string;
      styleUrl: string;
      attribution: string | null;
    }
  | {
      delivery: "included";
      id: string;
      label: string;
      styleHref: string;
      attribution: string | null;
    };
```

The initial included option is `neutral`: a project-independent MapLibre style
with a background and optional graticule only. Its `styleHref`, style document,
and every transitive sprite, glyph, source, and asset reference are contained,
inventoried, and checksummed. A later version may reference a licensed,
project-local PMTiles basemap.

### 3. Build one authoritative dependency inventory

Create a pure inventory layer in `@earth-stories/publisher` used by compilation,
preflight, handoff export, reports, and verification. Do not keep separate
lists of external URLs in each workflow.

```ts
interface PublicationDependencyBase {
  id: string;
  owner: { type: "basemap" | "source" | "chapter" | "runtime"; id: string };
  locator: string;
  estimatedBytes: number | null;
}

type PublicationDependency =
  | (PublicationDependencyBase & {
      delivery: "included";
      materialization: "copy-local" | "download-file" | "bundle-runtime";
      requirements: Array<"byte-ranges">;
      sha256: string;
    })
  | (PublicationDependencyBase & {
      delivery: "connected";
      materialization: "none";
      requirements: Array<"network" | "cors" | "byte-ranges">;
    })
  | (PublicationDependencyBase & {
      delivery: "unsupported";
      materialization: "none";
      requirements: Array<"network" | "cors" | "byte-ranges">;
      reason: string;
    });
```

Schema refinement requires `network` for connected dependencies, forbids it for
included dependencies, requires a non-empty reason for unsupported dependencies,
and rejects connected or unsupported entries in an offline manifest.

Compilation remains deterministic and does not fetch. Preflight resolves
availability, size, expected digest, and a constrained locator; the build
materializer copies or downloads; verification checks the result. Reports are
projections of this same inventory. Every included dependency, including runtime
and basemap files, is hashed from its materialized bytes. The ordered dependency
digests contribute to release identity alongside `digestProject(project)`, so a
remote-content change produces a different `build.id`.

### 4. Fail closed for unsupported content

For the first offline release:

| Content                                        | Offline behavior                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Local GeoJSON, image, CSV, trajectory          | Include                                                                      |
| Local or remote COG, PMTiles, GeoParquet, COPC | Include; download remote files at build time                                 |
| XYZ                                            | Block; ask the author to use a bounded PMTiles source or the neutral basemap |
| Zarr                                           | Block until bounded-store packaging exists                                   |
| YouTube/Vimeo chapter                          | Block; local video authoring is a follow-up                                  |
| Terrain or 3D buildings                        | Block while backed by the current remote services                            |
| Normal configured basemap                      | Replace with the explicit neutral offline style                              |

Do not silently remove a layer or animation merely to make the dependency count
zero. Every blocker identifies the affected chapter or source and a supported
alternative.

### 5. Vendor runtime dependencies

The current GeoParquet path selects DuckDB-Wasm from jsDelivr and installs its
spatial extension remotely. Package the chosen worker, Wasm module, pthread
worker when needed, and compatible spatial extension with the viewer build.
Resolve those URLs relative to the publication rather than calling
`getJsDelivrBundles()` in offline output.

The current COG path can resolve numeric CRS definitions through `epsg.io`.
During preflight/materialization, inspect included COGs and write the required
projection definitions into the manifest (or a small included projection
catalog). The viewer uses that catalog first and offline verification rejects a
COG that would still require a resolver request.

### 6. Verify dynamically, not only by inspecting strings

Static checks catch manifest dependencies but cannot prove a library will not
make an implicit request. Start the built folder on a loopback static server and
launch a fresh browser profile with cache and service workers disabled. Allow
requests only to the publication's exact scheme, host, and port; fail on every
other request, including other loopback origins. Visit `index.html`,
scroll/hydrate every chapter, and require all chapter readiness markers to
settle without runtime errors under one bounded overall timeout. Record
sanitized attempted origins in the failed verification report.

This check belongs in publication verification and in CI fixtures. A string
scan may supplement it but must not be the sole offline test.

## Implementation phases

### Phase 0 — Capability and licensing spike

- Prove DuckDB-Wasm plus the exact spatial extension can load from relative
  local files in the production viewer.
- Prove an included COG with a numeric CRS renders from an embedded projection
  definition with requests to `epsg.io` blocked.
- Inventory licenses and redistribution requirements for the runtime files and
  add them to the existing tool/dependency credits.
- Measure a representative offline viewer payload and document the baseline.

Exit criterion: the field-notes fixture plus one GeoParquet and one projected
COG fixture render with every request outside the exact publication origin
denied.

### Phase 1 — Contracts and dependency inventory

#### `packages/story-schema/src/project.ts`

- Add project v2 and migrate v1.
- Add `offline` to the publication profile.
- Add a defaulted offline basemap policy, initially `{ mode: "neutral" }`.
- Preserve IDs, creation time, source policies, and all v1 values in migration
  tests.

#### `packages/story-schema/src/publication.ts`

- Add publication v2, the discriminated basemap, connectivity guarantee, and
  optional local projection definitions/runtime asset references.
- Keep a v1 parser in both the viewer and verifier. Normalize legacy
  `basemap.styleUrl` into the connected-basemap representation and cover v1
  manifests with regression fixtures; the publisher emits only v2 after rollout.

#### `packages/publisher/src/dependencies.ts` (new)

- Implement the pure dependency inventory and stable diagnostic IDs.
- Cover basemaps (including `styleHref` and transitive style resources), every
  source kind, video chapters, terrain/buildings, COG projection resolution, and
  GeoParquet runtime files.

#### `packages/publisher/src/compile.ts`

- Resolve offline assets to relative `href` values.
- Emit the neutral basemap as an included, checksummed dependency and no
  connected dependency for it.
- Derive manifest connectivity from the inventory, not ad hoc arrays.
- Include the ordered materialized dependency digests in release identity.

Exit criterion: table-driven tests describe every source/chapter combination
and an offline manifest cannot parse with a connected dependency.

### Phase 2 — Preflight and materialization

#### `packages/publisher/src/preflight.ts`

- Use the shared inventory.
- Turn every `unsupported` offline item into a blocking readiness finding with
  a concrete replacement path.
- Report required download bytes, unknown sizes, available disk space when the
  platform exposes it, and whether the current build needs a connection.
- Distinguish “needs internet to assemble” from “publication needs internet to
  run.”

#### `packages/publisher/src/materialize.ts` (new)

- Move local-copy and remote-download behavior out of `build.ts`.
- Canonicalize local locators with `realpath` and require containment within the
  project workspace. For remote locators, allow only configured schemes and
  hosts, resolve and revalidate every redirect and destination address, block
  private/link-local/metadata ranges, and enforce byte and overall time limits.
- Stream to a temporary path, enforce containment and the size limit, verify the
  required digest, fsync, and rename atomically into persistent content-addressed
  storage. Rewrite the build plan to that local materialization.
- Bundle the neutral style, projection definitions, and runtime files.
- Deduplicate files referenced by more than one chapter/source.

#### `packages/publisher/src/build.ts`

- Assemble from the materialization plan.
- Keep the recoverable candidate/previous/latest promotion behavior.
- Write an offline candidate as unverified until the browser check passes.

Exit criterion: interrupted or failed downloads leave no partial asset and do
not replace the last successful release.

### Phase 3 — Offline-capable viewer

#### `packages/viewer/src/GeoParquetOverlay.tsx`

- Select bundles from manifest/runtime configuration.
- Load local worker/Wasm/extension files for offline manifests.
- Preserve lazy loading so stories without GeoParquet do not pay its runtime
  cost.

#### `packages/viewer/src/CogOverlay.tsx`

- Resolve projections from manifest definitions first.
- Report a clear unsupported-CRS error rather than falling through to a remote
  request in verified-offline mode.

#### `packages/viewer/src/MapChapter.tsx`

- Remove unconditional remote terrain/building locators from the rendering
  path; represent them as explicit manifest dependencies.
- Accept a relative bundled style URL.

#### `packages/viewer/src/StoryViewer.tsx`

- Render an offline-specific fallback for any future unsupported media instead
  of attempting a network request. Preflight should make this unreachable in a
  valid first-release build.

Exit criterion: browser request logging shows only URLs below the publication's
loopback origin while every supported chapter becomes ready.

### Phase 4 — Editor workflow and verification

#### `apps/editor/src/PublishPanel.tsx` and `PublishMenu.tsx`

- Add Offline with precise copy: “No internet required after this build.”
- Show two separate statuses: inputs to download during assembly and runtime
  dependencies after assembly.
- Present unsupported items before the build button and link to the source or
  chapter that needs attention.
- Show the verified-offline badge only from a completed verification report.

#### `packages/publisher/src/verify.ts`

- Add manifest invariants and checksums for all expected assets, including the
  basemap style and its transitive resources, and reject escaping references.
- Add the fresh-profile, exact-origin, time-bounded browser verifier and
  artifact-specific verification for folders, ZIPs, archives, embeds, PNGs, and
  animated captures.
- Serve included COG, PMTiles, GeoParquet, and COPC fixtures through the loopback
  server; require byte-range requests to return `206` with a valid
  `Content-Range`, and fail verification when range serving is unavailable.
- Persist external request attempts and chapter readiness results in
  `publication-verification.json`.

#### `apps/local-service/src/server.ts`

- Stream browser-verification progress to the existing export workflow or add
  a typed export-job endpoint if the check is long enough to outlive one
  request.
- Never expose arbitrary browser navigation through the loopback API.

Exit criterion: the UI cannot claim success before isolated verification and a
verification failure preserves the prior latest folder.

### Phase 5 — Offline authoring follow-up

After publication behavior is proven, add a separately labeled authoring
readiness check:

- show which Pixi capability environments are installed;
- offer “Prepare this computer for offline work” to prefetch selected, pinned
  environments with disclosed size;
- cache bundled examples or label network-dependent examples explicitly;
- add a no-network editor smoke test using projects whose tools and assets are
  already local.

Do not block the offline-publication release on full first-install authoring.

## Test plan

- Schema migration tests for project v1 to v2 and publication v2 validation.
- Viewer/verifier regression fixtures for legacy publication-v1 basemaps.
- Inventory matrix tests for every source kind, delivery override, basemap,
  video, terrain, buildings, and runtime dependency.
- Materializer tests for truncation, timeout, checksum mismatch, redirect and
  address rejection, duplicate references, containment, persistent offline
  reuse, retry, and candidate cleanup.
- Viewer tests with local DuckDB assets and injected COG projections.
- Publication tests proving ordinary connected/portable/custom behavior does
  not change.
- Browser tests that fail on any request outside the exact publication origin,
  disable caches/service workers, enforce the overall timeout, validate every
  output kind, exercise byte ranges, and wait for all chapter readiness markers.
- CI offline fixture containing prose, image, chart, GeoJSON, PMTiles, COG,
  GeoParquet, trajectory, and COPC chapters.

## Acceptance criteria

- An author can select Offline and understand any required build-time download.
- Unsupported content blocks before assembly with an actionable explanation.
- A successful build has zero manifest network requirements and zero observed
  external browser requests.
- Every included file is contained, present, nonempty, and integrity checked.
- The publication works from a loopback static server after the computer's
  network connection is disabled.
- Failed materialization or verification leaves the previous latest release
  untouched.
- Connected, portable, and custom publications remain backward-compatible in
  behavior.

## Principal risks

- DuckDB spatial-extension packaging may be platform/version sensitive; resolve
  it in Phase 0 rather than weakening the offline guarantee.
- Remote data can be very large or legally non-redistributable. Size and
  attribution/license warnings must appear before download.
- “Offline” is easily confused with opening through `file://`. The supported
  contract remains static HTTP on the local machine because byte-range formats
  need HTTP semantics.
- Copying arbitrary XYZ, Zarr, terrain, or building services creates unbounded
  downloads. The first release blocks these instead of pretending they are
  portable.
