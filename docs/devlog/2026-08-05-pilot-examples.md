# Pilot examples and verified releases

Earth Stories now gives a first-time author two useful starting paths: create a
blank project or make an editable local copy of a curated example. Authors can
also add reviewed public COG and PMTiles connections to any existing story.

## Built

- Added two example stories and three example data connections based on public
  sources already exercised by CNG Sandbox.
- Added local project cloning for templates without introducing master rows,
  workspace ownership, or a hosted database.
- Added local `.tif` and `.tiff` COG imports and routed them through the shared
  renderer and publisher.
- Added first-run example choices, an in-editor example-data library, clearer
  service-unavailable messaging, retry guidance, and terminal diagnostics for
  occupied or forbidden ports.
- Added post-build verification before publication promotion. Successful
  releases now include `publication-verification.json`.

## Deliberate differences from CNG Sandbox

CNG Sandbox seeds master database records and clones them into hosted
workspaces. Earth Stories has neither construct. Its bundled catalog produces
ordinary project folders, which preserves the local-first ownership model while
retaining the useful “start from something real” experience.

Automated browser E2E coverage remains deferred because the authoring interface
will continue to change during pilot work. Contract and unit coverage protects
the example catalog, cloning, publication verification, and existing safety
boundaries.
