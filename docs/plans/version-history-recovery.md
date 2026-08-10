# Implementation plan: story history, recovery, and release checkpoints

Status: proposed

Priority: high confidence and trust

Depends on: no other local-first initiative

## Outcome

Turn the existing timestamped safety backups into an understandable history
and recovery workflow. Authors can see what changed, create named checkpoints,
preview an earlier story, and restore it without losing the current state.
Publishing can record the exact story revision used, and authors can optionally
retain a known-good publication artifact.

History remains project-local. It does not add cloud accounts, sync, branches,
or collaborative merge semantics, and it does not put editor UI state into
`story.json`.

## Scope

The first release covers the authored story contract:

- immutable automatic revisions on successful saves;
- named, user-pinned checkpoints;
- semantic change summaries and read-only preview;
- atomic restore that itself creates history;
- clear retention and disk-usage behavior;
- lazy recognition of the existing `.earth-stories/backups/*.json` files.

Local source files are not copied for every JSON revision. Earth Stories
currently treats imported/prepared project files as durable project content and
has no normal API that overwrites them in place. The history UI must still warn
when an older revision references a file that has gone missing. Full snapshots
of mutable binary data, Git integration, and real-time collaborative undo are
outside the first release.

## Architectural decisions

### 1. Keep history outside the portable story contract

Store revisions under:

```text
<project>/.earth-stories/history/
  revisions/
    <revision-id>.json
  releases/
    <build-id>.zip          # only when explicitly retained
```

Each revision is a self-describing immutable envelope so a corrupt or stale
central index cannot make all history disappear:

```ts
interface PublicationRevisionMetadataV1 {
  buildId: string;
  profile: string;
  builtAt: string;
  verification: "verified" | "failed";
  retainedReleaseBytes: number | null;
  retainedReleaseSha256: string | null;
}

interface StoryRevisionV1 {
  schema: "earth-stories/revision/v1";
  id: string;
  createdAt: string;
  kind: "automatic" | "checkpoint" | "restore" | "publication" | "legacy";
  label: string | null;
  parentRevisionId: string | null;
  restoredFromRevisionId: string | null;
  projectDigest: string;
  revisionDigest: string;
  publication: PublicationRevisionMetadataV1 | null;
  project: StoryProject;
}
```

`projectDigest` is SHA-256 over canonical UTF-8 JSON for authored project fields,
excluding mutable timestamps and revision metadata. It identifies equal authored
content across repeated saves and restores. `revisionDigest` is SHA-256 over the
canonical envelope fields other than itself and distinguishes exact revisions
with different IDs, kinds, labels, lineage, or publication metadata. Build data
is immutable typed metadata; it is never encoded in `label`.

The filesystem is the authority. Listing reads and validates envelopes, sorts
them by `createdAt`, and can rebuild any optional cache.

### 2. Save the previous state before replacing it

On every successful save transaction, write an immutable revision of the
current on-disk project before promoting the new `story.json`. Under the same
per-project lock, write and fsync the revision envelope, atomically rename it,
and fsync the history directory before promoting `story.json` with the store's
file and directory durability steps. Persist a small transaction marker so
startup can reconcile crashes between revision promotion and story promotion;
recovery may discard an uncommitted duplicate revision, but a new head can never
lack its promised prior revision. A failed revision write fails the save rather
than creating a gap users were told was protected.

Do not create multiple revisions for identical project digests. Do create a
revision when its kind/label gives it independent meaning, such as a named
checkpoint or publication checkpoint.

### 3. Restore forward; never rewind history

Restoring revision R does not replace the clock with R's old timestamp. In one
locked transaction:

1. require the caller's expected current `metadata.updated` value;
2. preserve the current project as an `automatic` revision when its content is
   not already represented;
3. validate R and its local references;
4. create a new `restore` envelope whose project copies R's authored fields
   while preserving the current project ID and original creation time, whose
   parent is the preserved current revision, and whose
   `restoredFromRevisionId` is R;
5. assign a new monotonically increasing `metadata.updated` value;
6. durably promote the restore envelope, then atomically replace `story.json`
   with its embedded project using the recoverable transaction protocol.

The restored project becomes a new head. This keeps every recovery reversible
and preserves optimistic concurrency.

### 4. Show semantic changes, not a raw JSON patch

Create an environment-neutral diff module that reports author concepts:

- story metadata, basemap, theme, and publication profile changes;
- chapters added, removed, reordered, or edited;
- sources added, removed, or changed;
- data-library records added or removed;
- provenance and delivery-policy changes.

The first UI can show counts and named items. A field-level prose diff can
follow, but the API should return stable structured change records rather than
preformatted HTML.

### 5. Retain automatic and intentional history differently

Replace the current flat maximum of 20 backups with a documented policy:

- retain the newest 100 automatic revisions;
- retain named checkpoints and publication checkpoints until the author
  explicitly removes them;
- never prune the only valid revision;
- report history bytes in the UI;
- run pruning only after the new revision and `story.json` are durable.

Lineage IDs are non-authoritative audit metadata: pruning may leave a parent or
restore source unavailable, and listing/preview must show that state without
treating the surviving revision as corrupt. Pinned revisions do not implicitly
pin every ancestor.

Legacy backup files and migrated `legacy` envelopes count as automatic revisions
for pruning. Derive a stable legacy source identity from the original backup
name and content digest, store it in migration metadata, and deduplicate the raw
file and envelope during recovery/listing. Do not delete the raw file until the
new envelope is durable and verified; a crash before deletion must not expose
both copies as separate revisions.

### 6. Separate story checkpoints from heavy release retention

Every successful publication records a small `publication` story revision and
its build metadata. The normal latest-only publication lifecycle remains. An
author may then choose **Keep this release**, which stores a verified ZIP under
`history/releases/`. This opt-in step discloses its size; Earth Stories does not
silently retain many gigabytes of duplicate map data.

## Implementation phases

### Phase 1 — Revision store and legacy migration

#### `packages/project-store/src/history.ts` (new)

- Define revision schemas, digest creation, safe paths, listing, reading,
  checkpoint creation, and retention.
- Parse embedded projects through `parseStoryProject` so future project
  migrations apply consistently.
- Treat existing `backups/*.json` files as `legacy` revisions and migrate them
  lazily under the project lock.
- Ignore temporary files and surface invalid revisions individually rather than
  failing the entire history list.

#### `packages/project-store/src/store.ts`

- Replace `MAX_BACKUPS` and direct copy/prune logic with the revision store.
- Refactor the lock-protected write path into a transaction reusable by save,
  checkpoint, and restore.
- Add `listHistory`, `readRevision`, `createCheckpoint`, `restoreRevision`, and
  `deleteRevision` methods.
- Allow explicit deletion only for `checkpoint` and `publication` revisions;
  reject `automatic`, `restore`, and `legacy`, which remain retention-managed.
  Deleting a publication revision does not delete its retained release. Release
  deletion is a separate confirmed action, and a retained release remains
  addressable by build ID even if its story checkpoint was removed.

#### `packages/project-store/src/store.test.ts`

- Cover first save, repeated identical saves, concurrent saves, failure before
  promotion, monotonic timestamps, legacy backup migration, corrupt envelope
  isolation, legacy crash deduplication, retention with missing non-authoritative
  lineage, pinned revisions, and restore-after-restore.

Exit criterion: store-level tests prove no successful save or restore can lose
the immediately previous valid story.

### Phase 2 — Local API and semantic diff

#### `packages/project-store/src/diff.ts` (new)

- Implement stable structured change records by IDs, not array indices.
- Distinguish chapter reorder from delete/add and summarize narrative changes
  without returning sensitive content unless the caller requests details.

#### `apps/local-service/src/server.ts`

Add contained endpoints:

```text
GET    /api/projects/:id/history
GET    /api/projects/:id/history/:revisionId
POST   /api/projects/:id/history/checkpoints
POST   /api/projects/:id/history/:revisionId/restore
DELETE /api/projects/:id/history/:revisionId
POST   /api/projects/:id/releases/:buildId/retain
GET    /api/projects/:id/releases/:buildId/download
POST   /api/projects/:id/releases/:buildId/verify
POST   /api/projects/:id/releases/:buildId/restore-latest
DELETE /api/projects/:id/releases/:buildId
```

- Require `{ expectedUpdated }` for restore and checkpoint mutation.
- Return a compact summary from list; return a full project only from the
  individual revision endpoint.
- Return typed release results containing build ID, checksum, byte size,
  verification state, expected-current identity, and atomic-promotion outcome.
  Retain, restore, and delete operations require the expected current build or
  revision identity where stale actions could replace newer work.
- Reuse trusted-origin checks, body limits, project ID validation, and
  per-project locking.
- Never accept a filesystem path from the browser.

#### `apps/local-service/src/history.test.ts` (new)

- Test invalid IDs, cross-project access, stale restore requests, immutable
  envelopes, missing local assets, and response-cache behavior.

Exit criterion: API clients cannot overwrite a newer head or address history
outside the selected project.

### Phase 3 — Editor history experience

#### `apps/editor/src/api.ts`

- Add typed revision summary, detail, checkpoint, restore, delete, release
  retention/download/verification, restore-latest, and release-deletion calls.
- Parse the embedded project with the shared story parser.

#### `apps/editor/src/HistoryPanel.tsx` (new)

- Add a story-toolbar **History** action.
- Group revisions by day and show kind, label, time, author-facing summary,
  publication build ID when present, and retained-release size.
- Support selection, read-only story preview, “Create checkpoint,” and
  “Restore this version.”
- Make the restore confirmation explicit that the current version is preserved
  in history.
- Disable restore while there are unsaved browser edits; offer Save first.
- Show missing-asset findings in preview and never imply that JSON history
  restored a deleted binary file.

#### `apps/editor/src/App.tsx`

- Refresh the active project and readiness state after restore.
- Reset active chapter only when its ID no longer exists.
- Invalidate preview receipts and preflight caches because restore creates a
  new saved revision.

#### UI tests and Storybook

- Cover empty, legacy, long, corrupt-entry, missing-asset, loading, failed
  restore, and keyboard/focus states.
- Verify dates are readable but revision IDs remain copyable for support.

Exit criterion: an author can make changes, save, preview the prior state, and
restore it while retaining a path back to the newer state.

### Phase 4 — Publication checkpoints and retained releases

#### `packages/publisher/src/build.ts`

- After candidate verification, start a recoverable publication transaction
  containing the candidate identity and typed checkpoint metadata. Stage the
  checkpoint as pending, then finalize it and promote `latest` as one logical
  transaction with explicit commit state.
- On startup, reconcile both crash orders: remove or mark failed a checkpoint
  whose candidate never promoted, and finalize a pending checkpoint when its
  exact verified build became latest. History must never report an unpromoted
  build as successful.
- A checkpoint write or finalization failure fails promotion for the first
  release so every claimed successful build remains traceable.

#### `packages/project-store/src/releases.ts` (new)

- Create a retained-release ZIP only on explicit user action.
- Stream and checksum it; never buffer a full release in memory.
- Verify before restoring or downloading it.
- Promote a retained release through the same recoverable latest-directory
  replacement used by ordinary builds.
- Keep retained-release deletion independent from publication-revision deletion
  and require explicit confirmation for each.

#### `apps/editor/src/PublishPanel.tsx`

- Show the story checkpoint linked to the latest publication.
- Add **Keep this release** with size disclosure and **Restore as latest** for a
  retained, verified release.

Exit criterion: the author can identify the exact story state for a build and,
when they intentionally retained the artifact, recover that release without
recompilation.

## Test plan

- Property/table tests for semantic diffs across every chapter and source kind.
- Filesystem fault tests at each transaction boundary.
- Windows retry/rename and stale-lock coverage.
- Retention tests proving pinned revisions are never pruned.
- Restore concurrency tests with two clients and stale `expectedUpdated` values.
- Missing/corrupt revision and missing-asset behavior.
- Editor interaction and accessibility tests for preview, checkpoint, and
  restore.
- Publication integration test linking build ID, project digest, revision ID,
  and optional retained archive checksum, including both checkpoint-before-
  promotion and promotion-before-checkpoint crash recovery orders.

## Acceptance criteria

- Every successful save preserves the prior valid story as an immutable
  revision.
- Authors can understand meaningful changes without reading JSON.
- Restore is atomic, concurrency-safe, and itself reversible.
- Existing backup files appear in history without destructive migration.
- Named and publication checkpoints are not removed by automatic retention.
- History is clearly scoped to authored state; missing binary assets are
  detected and disclosed.
- Large publication artifacts are retained only with explicit consent and size
  disclosure.

## Principal risks

- A revision UI may imply full asset versioning. Product copy and missing-file
  checks must state the boundary clearly.
- History writes increase save I/O. Story JSON is small, but all writes should
  remain serialized and measured on Windows/network-mounted folders.
- Unlimited pinned checkpoints are safe for JSON but retained releases can be
  enormous; display disk usage and require explicit release retention.
- Git users may not want private history committed. Keep `.earth-stories/`
  operational metadata separate from portable source and document recommended
  ignore rules.
