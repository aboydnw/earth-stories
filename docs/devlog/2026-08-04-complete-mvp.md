# Complete MVP implementation

Earth Stories now supports the full local pilot workflow: create a project,
author multiple chapter types, import local assets or connect public sources,
preview the compiled publication, choose delivery policies, and download a
static ZIP.

## Built

- Expanded version-one schemas for scrollytelling, images, CSV charts,
  GeoParquet, and asset delivery overrides.
- Added safe binary asset import and temporary ZIP publication builds to the
  loopback service.
- Added source/chapter compatibility validation and generic asset copying to the
  deterministic publisher.
- Expanded the editor and shared viewer without introducing a second reader
  runtime.
- Added project-store and compiler regression coverage and completed the MVP
  roadmap and compatibility documentation.

## Differences from the initial direction

Generic client-side decoding and styling for arbitrary COG, GeoParquet, and
vector PMTiles sources is explicitly post-MVP. The first release preserves,
reports, and links these assets. It does not show a misleading empty layer or
reintroduce the former hosted conversion stack.

## Validation and lessons

The full typecheck, test, editor/viewer builds, fixture publication, formatting,
and independence checks pass. A loopback smoke test also created a project,
imported a GeoJSON file, exported a ZIP, and inspected its contents. Building
the viewer before starting the development processes keeps export available in
a fresh clone without coupling the service to Vite internals.
