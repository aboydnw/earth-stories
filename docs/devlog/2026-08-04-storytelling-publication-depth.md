# Storytelling and publication depth

## What changed

Earth Stories moved beyond pass-through geospatial links. The shared renderer
now opens COGs directly, discovers and draws vector or raster PMTiles, and loads
bounded GeoParquet sources through DuckDB spatial in the browser. These paths
are shared by editor preview, the static site, ZIP, and embed outputs.

The authoring interface gained map camera controls, layer colors and opacity,
COG band/rescale/colormap settings, PMTiles source-layer selection, legends,
attribution, basemap and story appearance settings, and chapter reorder,
duplicate, and delete actions.

Publishing now has connected, portable, and custom profiles with per-asset
overrides. Portable builds stream compatible remote geospatial files into the
release rather than buffering them in memory. Preflight estimates their size,
checks reachability, identifies remaining connected exceptions, and records
byte-range hosting requirements in the generated deployment report.

The loopback asset server now implements real single-range HTTP responses for
local COG, PMTiles, and GeoParquet preview. It previously advertised range
support while returning complete files, which these streaming readers could not
reliably consume.

## Deliberate boundaries

Portable is not an offline guarantee. Basemaps, XYZ tile pyramids, explicit
connected overrides, and the current GeoParquet runtime may still require the
network. Direct deployment and desktop installers remain later milestones.

## Lessons

Renderer features must be implemented vertically. Treating profiles, schema,
preview, static publication, archival snapshots, and deployment diagnostics as
one change prevents the editor from promising behavior the exported story does
not have.
