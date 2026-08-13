# Example stories and data

Earth Stories ships a small, versioned example catalog so a fresh local
workspace is useful before an author has prepared data. The catalog is part of
the application code and requires no hosted Earth Stories account or database.

## Example stories

The workspace lists complete stories built only from capabilities the shared
viewer currently supports alongside the author's own stories, with an
**Example** tag. Choosing one creates its project folder and `story.json` the
first time; later selections reopen that same editable local copy instead of
creating duplicates. Edits, publication settings, and exports never modify the
bundled template.

Each catalog row also says **Network required** or **Available offline** for
authoring. Included images, CSV files, and trajectories are copied from the
application into the editable project, but an example remains network-required
when its normal authoring basemap, a connected data source, or a video chapter
is remote. The label describes opening and editing the example; publication
preflight independently decides whether a requested release can be verified
offline.

The initial catalog contains:

- **Antakya from above**, a connected public COG story using OpenAerialMap
  imagery;
- **Lines on a shared planet**, a vector PMTiles story using geoBoundaries CGAZ
  administrative boundaries, contrasted against a real Copernicus DEM
  elevation image and chart;
- **Anatomy of a point cloud**, a COPC flyover at Autzen Stadium with a
  classification chart and an elevation-colored scatter render;
- **Fields through time**, a temporal Fields of The World Zarr story with a
  regional image and a prediction-confidence chart over Iowa cropland;
- **A story beyond the map**, demonstrating video and ordered map overlays;
- **Tracking a hurricane**, an animated `trajectory` source built from NOAA's
  public HURDAT2 best-track data for Hurricane Katrina (2005), with a wind-speed
  chart alongside it.

## Example connections

The editor's **Story data** inspector adds a curated connection and a map
chapter to the current story. The initial catalog includes Antakya aerial
imagery, global country and state/province PMTiles, Fields of The World Zarr,
and Autzen Stadium COPC. These URLs and their
attribution are explicit, reviewed source data—not silent dependencies on CNG
Sandbox.

Examples default to connected delivery. Authors can switch the publication
profile or override the individual asset when they want Earth Stories to copy a
compatible remote file into a portable release.

## Bundled template assets

`image` and `csv` sources can only ever be **included** — the project schema
gives them a local `path`, never a remote `locator` — so a template that uses
an image or chart chapter needs a real file to ship with it. The same is true
of a `trajectory` source whenever its data isn't already hosted somewhere with
the exact `{tracks: [{path, timestamps}]}` shape the viewer expects, which is
usually the case.

`apps/local-service/src/example-assets/<story-id>/<file>` holds those files,
one directory per story. `exampleAssets.ts` maps each `example-*` id to the
filenames it bundles; `ProjectStore.createFromTemplate` copies them into the
new project's `assets/` directory the first time a reader selects that
example, alongside writing `story.json`. A source's bundled filename must
match `<sourceId>.<extension>` exactly, since the compiled publication asset's
`href` is always derived from the source id, not the literal `path` string.

These files are themselves generated from real public data — a Copernicus DEM
tile, an Autzen Stadium point-cloud sample, a Fields of The World Zarr region,
PMTiles archive header statistics, and NOAA's HURDAT2 hurricane database —
using the same libraries (`@developmentseed/geotiff`, `copc`, `zarrita`,
`pmtiles`) the viewer itself uses to read those formats. There is no
regeneration script checked into the repo; treat the committed files as the
source of truth unless the underlying public dataset changes.

## Catalog rules

- Prefer public HTTPS sources with stable attribution for **connected**
  sources. Image, csv, and non-hosted trajectory sources are included by
  construction — bundle a real file under `example-assets/` instead.
- Add a story only after every chapter and source renders in the shared viewer.
- Keep templates small enough to understand and edit.
- Give every template a stable ID in the reserved `example-*` namespace.
  Ordinary project creation cannot occupy that namespace. Example selection
  materializes one editable local copy per template and reopens it thereafter;
  it never references mutable catalog state.
- Recheck remote availability during pilot reviews; the publication preflight
  remains authoritative at export time.
