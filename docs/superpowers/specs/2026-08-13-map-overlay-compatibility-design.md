# Map overlay compatibility and example-source recovery

Status: approved for implementation

## Problem

Earth Stories currently applies a chapter's globe projection without regard to
the renderer used by its data layers. MapLibre-native PMTiles, GeoJSON, and XYZ
layers can render on that globe, but deck.gl-backed COG, GeoParquet, Zarr, and
trajectory layers cannot. COPC uses a separate MapLibre control with the same
flat-map assumption. A globe camera can therefore leave the basemap, legend,
and readiness marker visible while its data layer fails. The Data Workspace
inherits the first chapter camera for a source, so it repeats the same failure.

Separately, both baked-in geoBoundaries CGAZ PMTiles URLs now return `404` from
their former Cloudflare R2 bucket. This breaks the boundaries, rich-media, and
storm-track examples.

## Projection behavior

`MapChapter` will decide the effective projection from every active map asset,
including the primary source and ordered overlays. If any asset uses COG,
GeoParquet, Zarr, trajectory, or COPC, the effective projection is Mercator even
when the authored camera requests globe. If all active assets are MapLibre
native—PMTiles, GeoJSON, or XYZ—the authored globe setting remains intact.

The authored camera is not mutated. This makes the fallback consistent in
story rendering, scrollytelling, publication, and Data Workspace without
example-specific changes. When an authored globe is suppressed, the map shows
a small status hint explaining that Mercator is being used for dataset
compatibility.

## Error propagation

The shared `DeckOverlay` adapter will accept an error callback and pass it to
deck.gl's `MapboxOverlay`. It will normalize thrown values into a useful message
and keep a ref to the latest callback, matching the existing render callback
behavior. COG, GeoParquet, Zarr, and trajectory overlays will supply their
existing `onError` callback to the adapter. Those errors will therefore reach
`MapChapter.reportError`, activate the existing **Map source unavailable**
panel, and prevent a silent success signal.

COPC already routes its control failures through `onError`; it needs the
projection fallback but no deck adapter change.

## Example-source replacement

The two dead example locators will be replaced with the separate ADM0 and ADM1
archives published by UNDP's open `cgaz-admin-boundaries` project:

- `https://undpngddlsgeohubdev01.blob.core.windows.net/admin/cgaz/ADM0.pmtiles`
- `https://undpngddlsgeohubdev01.blob.core.windows.net/admin/cgaz/ADM1.pmtiles`

Both endpoints currently provide CORS-enabled byte ranges and PMTiles v3
metadata with the `admin` vector source layer. The example sources will pin
that source-layer name rather than rely on discovery. ADM0-only cameras will
stay at zooms 0–3. Chapters that use ADM1 will stay at zooms 4–5; MapLibre can
overscale the ADM0 archive in the mixed-layer chapter so both levels remain
visible.

The boundaries example's included archive-statistics CSV and corresponding
narrative will be updated from the replacement ADM0 header. Attribution will
continue to name geoBoundaries under CC BY 4.0 and will identify UNDP as the
archive host where useful. This is a public-host replacement, not a promise
that Earth Stories controls its availability.

## Verification

Regression tests will prove that:

- a deck-backed primary source suppresses an authored globe;
- a deck-backed overlay also suppresses globe;
- a PMTiles-only chapter preserves globe;
- the compatibility hint appears only when the fallback is active;
- a deck error reaches the visible map error panel;
- the Data Workspace inherits the same central projection behavior;
- the example catalog and all baked-in story copies use the replacement URLs,
  compatible source layer, and suitable cameras;
- the replacement endpoints are documented as externally hosted.

Focused viewer and example tests will run first, followed by type checking, the
full test suite, relevant builds, formatting, and diff checks. No CI workflow
will be added.
