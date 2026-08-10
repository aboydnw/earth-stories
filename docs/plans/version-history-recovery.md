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
interface StoryRevisionV1 {
  schema: "earth-stories/revision/v1";
  id: string;
  createdAt: string;
  kind: "automatic" | "checkpoint" | "restore" | "publication" | "legacy";
  label: string | null;
  parentRevisionId: string | null;
  restoredFromRevisionId: string | null;
  projectDigest: string;
  project: StoryProject;
}
```

The filesystem is the authority. Listing reads and validates envelopes, sorts
them by `createdAt`, and can rebuild any optional cache.

### 2. Save the previous state before replacing it

On every successful save transaction, write an immutable revision of the
current on-disk project before promoting the new `story.json`. Use the same
per-project lock and atomic-write discipline as the current store. A failed
revision write fails the save rather than creating a gap users were told was
protected.

Do not create multiple revisions for identical project digests. Do create a
revision when its kind/label gives it independent meaning, such as a named
checkpoint or publication checkpoint.

### 3. Restore forward; never rewind history

Restoring revision R does not replace the clock with R's old timestamp. In one
locked transaction:

1. require the caller's expected current `metadata.updated` value;
2. snapshot the current project;
3. validate R and its local references;
4. copy R's authored fields while preserving current project ID and original
   creation time;
5. assign a new monotonically increasing `metadata.updated` value;
6. atomically replace `story.json`;
7. record `restoredFromRevisionId` in the revision metadata, not the project.

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

Legacy backup files count as automatic revisions until lazily migrated. Do not
delete them during migration until their new envelopes have been verified.

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
  `deleteCheckpoint` methods.
- Only allow deletion of user-pinned checkpoint metadata/release archives;
  automatic history remains retention-managed.

#### `packages/project-store/src/store.test.ts`

- Cover first save, repeated identical saves, concurrent saves, failure before
  promotion, monotonic timestamps, legacy backup migration, corrupt envelope
  isolation, retention, and restore-after-restore.

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
```

- Require `{ expectedUpdated }` for restore and checkpoint mutation.
- Return a compact summary from list; return a full project only from the
  individual revision endpoint.
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

- Add typed revision summary, detail, checkpoint, restore, and delete calls.
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

- After candidate verification but before latest promotion, request a
  publication checkpoint containing build ID, project digest, profile, build
  time, and verification status.
- Ensure a checkpoint failure follows an explicit policy: for the first
  release, fail promotion so every claimed build remains traceable.

#### `packages/project-store/src/releases.ts` (new)

- Create a retained-release ZIP only on explicit user action.
- Stream and checksum it; never buffer a full release in memory.
- Verify before restoring or downloading it.
- Promote a retained release through the same recoverable latest-directory
  replacement used by ordinary builds.

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
  and optional retained archive checksum.

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
