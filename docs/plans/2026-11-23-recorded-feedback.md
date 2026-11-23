# Recorded feedback: 23 November 2026

Implementation scope from the 6m35s recording `riffrec-2026-11-23-1210-359944.zip`.
The user confirmed a shared workspace library with shared file references.

## Design

Simplify the editor header to Save and Publish, with Preview inside the Publish
menu. Remove routine save/readiness badges and optional warning panels; preserve
compiler validation and actionable build errors. Remove the new-story AI entry
point and bare creation route; retain Story settings enhancement and existing
candidate links so previously generated work remains recoverable.

Focused map previews use the shared renderer with a definite map height and
narrative in normal document flow. Product checkbox layout must remain separate
from text input rules. Dragging/zooming continues to set the authored starting
view through the existing debounced camera mechanism.

The service owns immutable datasets under `.data-library/<uuid>/`. Uploads stage
privately and appear only after atomic rename; connected sources are validated
records. No story is required. Adding a dataset to a story saves a shared
`workspace-data/<uuid>/data.<extension>` locator under the project write lock,
without a client-generated revision or duplicate file. Ordinary project paths
remain project-contained; this explicit namespace alone resolves into the
workspace library, with lexical and canonical containment checks. No arbitrary
filesystem authority reaches the browser.

The existing v3 string path/locator fields carry the reserved namespace. Compiled
publications continue to use ordinary included assets. Preflight, materialization,
archival reads, authoring preview, and enhancement context resolve references
through the same checked filesystem helper. Moving an editable story requires its
workspace library; built publications are independent. Existing project-local
sources remain unchanged. This change does not add deletion or mutable dataset
replacement, so a library action cannot silently invalidate another story.

## Implementation and verification plan

- [x] Reproduce the timestamp conflict from the recording and inspect preview CSS.
- [x] Add a service-owned library and tests for restart, shared references,
      oversized-upload cleanup, and traversal/symlink rejection.
- [x] Wire upload, connection, ranged reads, and atomic attachment routes.
- [x] Update Data to upload without choosing a story and attach from dataset details.
- [x] Resolve shared data through preview, publication, and AI context boundaries.
- [x] Simplify header/publication presentation and focused-map layout.
- [x] Verify library routes and independent publication materialization.
- [x] Exercise map rendering, checkbox state, camera updates, upload and attachment
      in Chromium with disposable projects, including a narrow viewport.
- [x] Run repository checks; document failures or unavailable platform checks.
- [x] Open a ready-for-review pull request and archive the original recording.

## Verification results

- Passed: 1,524 tests across 192 files; type checking; UI contracts; independence;
  editor and viewer production builds; fixture publication; Storybook build;
  publishing without Git (126 tests); changed-file formatting and diff checks.
- Chromium under a virtual display: actual map rendering, camera persistence on
  drag, Globe checkbox, shared upload without a destination, attachment to a
  story, and narrow Canvas layout with reduced motion. Legend and zoom controls
  remain separate; narrative follows the map.
- Full repository formatting reports four unchanged existing files (two roadless
  GeoJSON fixtures, the Kronebreen GeoJSON, and the production-pilot plan).
- Offline-runtime browser proof passed with 26 same-origin paths and no external
  requests. An attempted explicit default-projection change caused a readiness
  regression during verification and was removed before review.

Review: https://github.com/aboydnw/earth-stories/pull/49. The original recording is
archived under `.feedback/archive/`; recoverable extracted media was removed.
