# Implementation plan: portable project handoff

Status: proposed

Priority: high team value

Depends on: shared dependency inventory; self-contained mode also depends on
offline materialization

## Outcome

Let an author package an editable Earth Stories project into one integrity-
checked `.earthstory` file, hand it to another person or move it to another
computer, and import it safely. The recipient gets a working local project,
clear knowledge of anything that remains connected, and deterministic handling
of project-ID collisions.

This is distinct from the publication ZIP. A publication ZIP is reader-facing
compiled output; an `.earthstory` bundle is author-facing source material that
can be opened and edited again.

## Scope

The first release provides two handoff presets:

- **Working copy** includes `story.json` and every referenced local/prepared
  asset required to edit and preview. Connected sources remain URLs and are
  listed in the handoff report.
- **Complete archive** additionally includes raw data-library inputs and other
  author-owned project files, excluding derived publications, private history,
  temporary files, locks, trash, and conversion/runtime caches.

A later **Self-contained working copy** can materialize compatible connected
files using the offline-publication dependency engine. It must still block or
report unbounded services such as XYZ, remote Zarr stores, and hosted video.

The bundle does not include Earth Stories itself, operating-system credentials,
Pixi environments, caches, or hidden data from outside the project directory.

## Architectural decisions

### 1. Define a versioned bundle, not “ZIP this folder”

Use ZIP as the container and `.earthstory` as the user-facing extension:

```text
handoff.json
README.txt
project/
  story.json
  assets/...
  data/...
```

`handoff.json` is a strict shared schema:

```ts
interface EarthStoryHandoffV1 {
  schema: "earth-stories/handoff/v1";
  createdAt: string;
  appVersion: string;
  mode: "working-copy" | "complete-archive" | "self-contained";
  originalProjectId: string;
  projectSchema: string;
  projectDigest: string;
  files: Array<{
    path: string;
    sizeBytes: number;
    sha256: string;
    role: string;
  }>;
  excluded: Array<{ category: string; reason: string }>;
  externalDependencies: Array<{
    resourceId: string;
    locator: string;
    requirements: string[];
  }>;
}
```

The manifest covers every archived file except itself, uses normalized POSIX
relative paths, deterministic ordering, and SHA-256 digests. `README.txt`
explains how to install/open Earth Stories and summarizes connected dependencies
for recipients who inspect the archive without the app.

### 2. Derive contents from project semantics and containment

Create one project-file inventory that classifies:

- the current `story.json`;
- files referenced by local source `path`/`locator` values;
- files referenced by `dataAssets`;
- other ordinary files below the project directory;
- generated publication output;
- `.earth-stories` metadata, locks, temporary files, and symlinks.

Working-copy selection comes from references. Complete-archive selection adds
ordinary author files. Never follow symlinks outside the real project root and
never accept browser-supplied filesystem paths.

Files referenced by the story but missing or outside the project block export.
Unreferenced ordinary files produce a selectable size category rather than
being silently included in a small working copy.

### 3. Export a snapshot without mutating the project

Acquire a read-consistent project transaction: validate the saved revision,
inventory paths, stream each file into the archive, and confirm size and digest
against its final stat. If a file changes during streaming, fail and ask the
author to retry. Do not rewrite `story.json` merely to export it.

Self-contained mode, when added, builds a cloned in-archive project contract
whose remote compatible sources point to bundled relative files. Preserve the
original URL in structured provenance/dependency metadata. The open project on
disk remains untouched.

### 4. Import into a staging directory and promote atomically

Never extract directly into the workspace. Stream into a random staging
directory under the configured project root while enforcing:

- no absolute, parent (`..`), drive-letter, UNC, NUL, or duplicate paths;
- no symlink, device, or special-file entries;
- per-file, total-expanded-size, file-count, and compression-ratio limits;
- exact manifest membership, sizes, and SHA-256 checksums;
- a valid supported project schema and contained project references.

Only after every check passes should the service rename the staged folder into
the workspace. Failed imports remove staging data and never alter an existing
project.

### 5. Make ID collisions an explicit product choice

If `originalProjectId` is unused, preserve it. If it already exists, offer:

- **Open existing** without importing;
- **Import as a copy**, allocating a new project ID and title suffix while
  preserving chapter/source IDs;
- **Cancel**.

Do not offer overwrite in the first release. Copy import rewrites only the
project ID and relevant build-independent metadata, assigns new creation/update
times, validates the result, and records the original project ID in the import
receipt outside `story.json`.

### 6. Keep private operational history out by default

`.earth-stories/history`, retained releases, local trash, conversion logs, and
temporary job state can disclose editorial history or greatly inflate a bundle.
Exclude them from both default presets. A future encrypted archival workflow
can include history deliberately; it should not be smuggled into ordinary
handoff.

## Implementation phases

### Phase 1 — Handoff schema and project inventory

#### `packages/story-schema/src/handoff.ts` (new)

- Define the strict v1 handoff manifest, file roles, modes, exclusions, and
  dependency summary.
- Export a parser that rejects unknown versions with an actionable error.

#### `packages/project-store/src/inventory.ts` (new)

- Resolve referenced files for every source kind and `dataAssets`.
- Walk ordinary project files with realpath containment and no symlink escape.
- Classify generated/private/temporary paths through explicit rules.
- Return missing, escaped, duplicate, and changed-file findings with stable IDs.

#### `packages/project-store/src/inventory.test.ts`

- Cover all source kinds, nested files, Unicode names, Windows names, symlinks,
  hardlinks, missing references, publications, history, and temp files.

Exit criterion: the same saved project always produces the same ordered logical
inventory on every supported OS.

### Phase 2 — Streaming export and preflight

#### `packages/project-store/src/handoff.ts` (new)

- Produce deterministic ZIP entry order without buffering large files.
- Hash while streaming and write `handoff.json` only after file metadata is
  known, using a temporary candidate archive.
- Re-stat files to detect changes during export.
- Generate the plain-text recipient README and exclusion report.

#### `apps/local-service/src/server.ts`

Add:

```text
GET  /api/projects/:id/handoff/preflight?mode=working-copy|complete-archive
POST /api/projects/:id/handoff?mode=working-copy|complete-archive
```

- Return total bytes, file counts, exclusions, missing-file blockers, connected
  dependencies, and unknown sizes from preflight.
- Stream the final bundle with a safe filename and no in-memory archive copy.
- Use a per-project export lock compatible with publication builds and saves.

#### `apps/editor/src/HandoffPanel.tsx` (new)

- Add **Share editable project** to workspace row actions and story settings.
- Explain working copy versus complete archive in author language.
- Show included categories and sizes, excluded private/generated material, and
  connected dependencies before download.
- Require the story to be saved and the preflight to be current.

Exit criterion: a multi-gigabyte project can be exported with bounded memory,
and a changed/missing source fails before a misleading success result.

### Phase 3 — Safe import and collision handling

#### `packages/project-store/src/import-handoff.ts` (new)

- Stream/decompress into project-root staging with archive-bomb limits.
- Validate normalized paths before creating each file.
- Hash each file and compare the exact manifest.
- Reject undeclared archive entries and missing declared entries.
- Parse/validate the project and all local references from the staged root.
- Implement preserve-ID and clone-ID promotion plans.
- Write an import receipt to `.earth-stories/import.json` after promotion.

#### `apps/local-service/src/server.ts`

Add a staged workflow rather than a single ambiguous overwrite endpoint:

```text
POST   /api/handoffs/inspect
POST   /api/handoffs/:inspectionId/import
DELETE /api/handoffs/:inspectionId
```

- Inspection streams to a bounded temporary file/staging area and returns
  metadata, compatibility, dependencies, size, and collision state.
- Import accepts only `preserve` or `copy`; never a destination path.
- Expire abandoned inspections and clean them on service restart.

#### `apps/editor/src/ImportHandoffDialog.tsx` (new)

- Add **Import project** to the workspace.
- Support file picker and drag/drop with progress and cancellation.
- Show author/title, source app/schema version, included sizes, connected
  dependencies, and any incompatibility before import.
- Handle collisions explicitly and open the promoted project on success.

Exit criterion: a malicious or corrupt archive cannot write outside staging or
partially replace a project, and a valid round trip opens with the same story
digest and local asset bytes.

### Phase 4 — Self-contained handoff

- Reuse `packages/publisher/src/dependencies.ts` and materialization from the
  offline-publication plan.
- Add a preflight matrix for which connected sources can be copied.
- Build an in-archive transformed project with relative locators and included
  delivery while preserving original URLs in provenance.
- Block or clearly retain XYZ, Zarr, hosted video, terrain, and building
  dependencies according to the offline capability matrix.
- Run an imported-project preview smoke test from staging before promotion.

Exit criterion: “Self-contained” is offered only when the imported working copy
can preview without external requests; otherwise the UI continues to call it a
working copy and lists remaining connections.

### Phase 5 — Desktop integration

- Register `.earthstory` as a file type in desktop packages.
- Route OS “Open with Earth Stories” events through the same inspect/import UI.
- Add **Show project folder** and **Export editable project** native menu items
  without bypassing API validation.

This phase belongs after desktop packaging and is not required for browser-
based clone-and-run users.

## Test plan

- Schema tests for valid manifests, unsupported versions, unknown fields, bad
  checksums, and unsafe paths.
- Inventory tests across Linux, macOS, and Windows path semantics.
- Streaming tests with large sparse fixtures and assertions on bounded memory.
- Zip-slip, symlink, duplicate-entry, case-collision, decompression-bomb,
  truncated archive, and undeclared-file tests.
- Round trips for working copy, complete archive, ID-preserving import, and
  collision-as-copy.
- Project fixtures containing every supported source and data-asset type.
- UI tests for size disclosure, connected warnings, cancellation, collision,
  incompatible schema, and successful open.

## Acceptance criteria

- Authors can distinguish an editable handoff from a published reader ZIP.
- The preflight states exactly which files and connected dependencies the
  recipient will receive.
- Export does not mutate the current project and uses bounded memory.
- Import verifies every file before atomically promoting a project.
- No archive entry or project reference can escape the staged/project folder.
- ID collisions never overwrite an existing project.
- A valid working-copy round trip preserves the story digest and referenced
  local asset bytes.
- Private history and generated publications are excluded by default and named
  in the report.

## Principal risks

- Geospatial projects can be hundreds of gigabytes. Every operation must stream,
  disclose size, support cancellation, and check available disk space where
  possible.
- ZIP libraries differ in ZIP64 and filename behavior. Select and test one that
  supports streaming ZIP64 on every supported platform before committing the
  file format.
- Connected source licensing may forbid redistribution. Working-copy mode keeps
  URLs; self-contained mode must surface provenance/license warnings before
  download.
- Case-insensitive filesystems can collapse distinct archive paths. Reject
  portable-path collisions during export and import.
