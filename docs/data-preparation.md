# Data preparation

Earth Stories prepares raw geospatial data locally and keeps both the input and
prepared output inside the author's project. Nothing is uploaded. The first use
of a capability shows its estimated download size and provisions a pinned Pixi
environment; later jobs reuse Pixi's cache. A failed provision or conversion is
visible, retryable, and never turns a partial output into a project source.

| Input                | Prepared output                    | Primary tools                               |
| -------------------- | ---------------------------------- | ------------------------------------------- |
| GeoTIFF              | validated COG                      | rio-cogeo, rasterio, GDAL                   |
| Shapefile / GeoJSON  | GeoParquet or PMTiles              | DuckDB Spatial, GDAL PMTiles; GDAL fallback |
| CSV with coordinates | GeoParquet or PMTiles              | DuckDB Spatial, GDAL PMTiles                |
| NetCDF / HDF5        | selected 2D slice as validated COG | xarray, rasterio, rio-cogeo, GDAL           |
| LAS / LAZ            | COPC                               | PDAL                                        |
| GPX                  | trajectory sidecar JSON            | Earth Stories local worker                  |

Raster preparation also inspects the finished COG for a colour table, a raster
attribute table, or an integer band with no more than thirty distinct values.
When one of those matches, the new source starts with a colour per class and a
display range spanning the class values, so a land-cover or classification
raster is legible before any manual styling. Authors edit or clear those colours
under **Map appearance**.

For multidimensional inputs, inspection lists variables and dimensions. The
author chooses a variable and indices for non-spatial dimensions; this release
stores and prepares that selected 2D slice. Time-series authoring can build on
the same selection contract later.

Prepared vector output is selected automatically. GeoParquet is the reusable
feature target; PMTiles is selected for tiled delivery. GDAL's native PMTiles
driver is the v1 implementation, avoiding a mandatory tippecanoe installation.
See [ADR 0001](adr/0001-conversion-runtime.md) for the tradeoffs.

Source-development lock data is committed for macOS, Linux, and Windows x64.
Pixi's checksum-verified Windows bootstrap uses the same lazy environments, so
authors do not install GDAL, PDAL, or another system package. CI is intentionally
absent in the current phase, and the installed desktop application has not
completed the target-machine conversion matrix on any platform. Windows ARM
remains outside the target matrix. See the
[desktop application guide](desktop-application.md) for the precise support
boundary.

The desktop workspace settings show a separate **Offline authoring readiness**
list for all five pinned capability environments. Installed environments show
their measured apparent size. An author can select any missing environments,
review the combined estimated footprint, and choose **Prepare this computer for
offline work** while connected. Preparation uses the same locked manifests and
application-owned Pixi cache as conversion jobs, skips environments that are
already installed, and removes an incomplete environment after failure so a
retry starts from a safe state. This is optional and does not change whether an
offline publication is verified.

## Pilot workflow

1. Create a story and open **Story data**.
2. Import a raw file. Review the detected format, fields, CRS, variables, or
   coordinate-column choices.
3. Start preparation and allow the disclosed capability download if this is the
   first use. Follow progress through provision, prepare, and verify.
4. Add the prepared source to one or more map chapters. Set attribution,
   delivery policy, styling, filters, and format-specific controls.
5. Review the story using the same renderer that will ship in the publication.
6. Open **Publish**, resolve preflight findings, then build a folder, ZIP,
   archival HTML, embed, attributed PNGs, or animated capture.
7. Open the built publication and confirm connected resources work from the
   intended host. The dependency and verification reports document exceptions.
