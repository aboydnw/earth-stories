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
  chart alongside it;
- **The Ground Remembers**, a 12-chapter HIFLD natural-hazards story combining
  significant earthquakes, plate boundaries, faults, volcanoes, tsunamis,
  aerial imagery, charts, and a public-domain photograph;
- **The Grid Between Us**, a 12-chapter HIFLD infrastructure story combining
  plants, a non-spatial generating-units summary, transmission lines,
  operational territories, gas pipelines, fueling stations, capacity and
  unit-count charts, and a public-domain image.

## Example connections

The editor's **Story data** inspector adds a curated connection and a map
chapter to the current story. The initial catalog includes Antakya aerial
imagery, global country and state/province PMTiles, Fields of The World Zarr,
and Autzen Stadium COPC. These URLs and their
attribution are explicit, reviewed source data—not silent dependencies on CNG
Sandbox.

The geoBoundaries CGAZ connections use the separate ADM0 and ADM1 PMTiles
archives published by UNDP GeoHub. UNDP is an external host that Earth Stories
does not control, so these URLs remain subject to the same availability review
as every other connected example source. The underlying boundary attribution
and CC BY 4.0 license remain unchanged.

Examples default to connected delivery. Authors can switch the publication
profile or override the individual asset when they want Earth Stories to copy a
compatible remote file into a portable release.

## HIFLD live API verification

The HIFLD sources in both stories were checked against the live catalog on
2026-08-18. The earthquake story uses seven connected HIFLD PMTiles archives;
the electricity story uses eight. Every connected archive pins the `v1.0.0`
URL returned by its file record and supports the byte-range requests the viewer
needs:

```text
https://hifld.publicenvirodata.org/storage/<dataset>/<file>/<version>/pmtiles/<file>.pmtiles
```

The Historical Tsunami Event Locations record is an unusual but intentional
exception to ordinary naming: its dataset, file, and archive slugs all end in a
hyphen (`historical-tsunami-event-locations-`). Removing that hyphen produces a 404.

Generating Units is a HIFLD dataset but not a connected map layer. Its live
file record contains 32,344 non-spatial rows and offers GeoJSON, GeoPackage, and
file-geodatabase formats, but no PMTiles. Earth Stories therefore ships a small
`generating-units.csv` summary grouped into ten technology families. Unit
counts retain every row; summer-capacity sums omit 159 non-positive sentinel
values and are rounded to whole megawatts. The source provenance records those
transformations and the source's 2023-09-01 data date.

The technology-family mapping matches `TYPE` values containing `NATURAL GAS`,
`COAL`, `HYDROELECTRIC`, or `PETROLEUM` to those four families. `LANDFILL GAS`,
`MUNICIPAL SOLID WASTE`, and `WOOD/WOOD WASTE BIOMASS` become Biomass and
waste; `BATTERIES` and `OTHER GASES` become Other and storage. Nuclear, Wind,
Solar, and Geothermal retain their named families.

The live audit also found upstream HIFLD quality warnings. Reliability
Coordinators reports 6 invalid geometries out of 13, Electric Retail Service
Territories 254 out of 2,931, and Electric Planning Areas 20 out of 95. Natural
Gas Pipelines fails the overall quality check even though its metadata reports
zero invalid geometries and does not expose the failing criterion. The affected
chapters disclose these limitations; Earth Stories does not claim to repair
the source geometries.

Unit tests validate the exact source inventory, URLs, dates, included-data
contract, and publication compilation without making the default suite depend
on network availability. Maintainers should repeat the live API and PMTiles
header audit before changing a version pin or claiming a later access date.

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

## Katrina's illustrated atlas

“Tracking a hurricane” uses the optional **Illustrated Atlas** theme. Seven
short chapters connect the 34 included best-track positions to their recorded
wind speeds. Readers can turn pages, jump to a chapter, explore/pause/scrub the
map, return to its authored view, or read everything as an ordinary document.
It does not require a long, locked scroll sequence.

The original `katrina-track.json` and `katrina-intensity.csv` are unchanged.
Chapter time positions are calculated from actual UTC timestamps. The chart
uses elapsed time, including irregular landfall fixes. The narrative separates
the 150-knot peak on 28 August from the 110-knot Buras landfall on 29 August,
and makes clear that weakening began offshore. Wind categories and the center
track are not a surge model or a measure of neighborhood impacts.

The included `storm-sea.png` is generated decorative artwork, not a historical
photograph, satellite image, or observation. Its caption, alt text and provenance
say so. The live basemap and state boundaries still require a connection in the
example's connected profile. Existing editable copies of the old example are
not silently overwritten; the new template applies to newly created copies.

The Katrina template opts into the atlas's **Sea and clouds** atmosphere. The
opening engraving becomes a wide scene with independent cloud and foreground
wave motion. Between chapters, a shared 1.6-second transition controls the
map camera, track time, and scene reveal. **Pause motion**, **Skip transition**,
and **Motion on/off** controls remain available above the scene. Exploring
the map or using its time controls takes over from the authored transition.

The motion is decorative, not a reconstruction of cloud patterns, storm size,
winds, rain, or surge. The actual track and chart still use the unchanged 34
fixes. Reduced motion and Read all chapters provide static routes. Existing
editable projects remain untouched; create a new template copy or explicitly
choose Illustrated Atlas → Sea and clouds in Story settings.
