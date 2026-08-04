# Publication hardening

Earth Stories Phase 2 adapts the strongest CNG publication concepts to the
local-first architecture. Authors now run preflight and build a latest release
as a folder, ZIP, archival HTML document, or iframe embed from one publication
workshop.

## Built

- Added blocking and advisory preflight findings, local-file verification,
  connected-resource disclosure, accessibility checks, and size estimates.
- Added recoverable latest-folder replacement with no retained history.
- Made the viewer use relative asset URLs for static subdirectory deployment.
- Added a self-contained archive with Dublin Core metadata, inline images and
  chart SVGs, citations, and captured map canvases or visible fallbacks.
- Added an embed entrypoint that hides publication chrome and a safe iframe
  generator that preserves the fixed viewport required by scrollytelling.
- Added editor progress, output results, embed copying, documentation, and
  regression tests.

## Differences from CNG Sandbox

No hosted publish state, viewer subdomain, ingestion API, or server-managed
story is required. All outputs derive from the compiled Earth Stories manifest
and project folder. The browser contributes map snapshots to the archival build;
if cross-origin canvas security prevents capture, the archive explicitly says
the snapshot is unavailable instead of silently dropping the map.

## Validation

Twelve tests, type checking, formatting, editor/viewer builds, fixture
publication, and the independence check pass. The loopback test created a
project, ran preflight, built the latest folder, downloaded archive and ZIP
outputs, generated a deployment-aware iframe, inspected the ZIP, and verified
the archive metadata.
