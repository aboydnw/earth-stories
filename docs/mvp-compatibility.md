# MVP compatibility

This matrix is intentionally smaller than CNG Sandbox. Unsupported features
must be rejected explicitly rather than silently changed during export.

| Capability             | MVP status | Initial behavior                                                  |
| ---------------------- | ---------- | ----------------------------------------------------------------- |
| Prose chapter          | Included   | Rendered as authored                                              |
| Map chapter            | Included   | Primary layer, ordered overlays, and camera state                 |
| Scrollytelling chapter | Included   | Sticky map layout in shared viewer                                |
| Image chapter          | Included   | Project-owned image copied into publication                       |
| Rich chart chapter     | Included   | Bar/line, multiple Y series, ranges, labels, linear/log scale     |
| Video chapter          | Included   | Privacy-enhanced YouTube/Vimeo embed plus archival source link    |
| Public or local COG    | Rendered   | Direct range-request rendering; connected or included             |
| PMTiles                | Rendered   | Vector/raster archive rendering with discovered source layers     |
| GeoJSON                | Included   | Imported, copied, and rendered in map                             |
| GeoParquet             | Rendered   | In-browser DuckDB spatial rendering up to 100k features           |
| XYZ raster             | Included   | Connected external dependency                                     |
| Zarr                   | Rendered   | Connected GeoZarr with variable slices and temporal scrubber      |
| COPC                   | Rendered   | Connected or included range-streamed point cloud                  |
| Trajectory             | Rendered   | Connected or included trips JSON with journey scrubber            |
| Flyover / terrain      | Rendered   | Scroll keyframes, terrain, globe, and optional 3D buildings       |
| Offline guarantee      | Deferred   | No offline claim                                                  |
| Direct publishing      | Deferred   | User deploys latest folder or ZIP                                 |
| Latest folder build    | Included   | Recoverable replacement in project folder                         |
| Archival HTML          | Included   | One self-contained preservation document                          |
| Iframe embed           | Included   | Fixed-height scrollport via `embed.html`                          |
| Publication history    | Deferred   | Latest successful release only                                    |
| Example stories        | Included   | Curated templates become independent editable local projects      |
| Example connections    | Included   | Public supported sources can be added to any story                |
| Connected profile      | Included   | Remote sources remain dependencies                                |
| Portable profile       | Included   | Compatible geospatial files copied locally                        |
| Custom profile         | Included   | Per-asset delivery overrides are authoritative                    |
| Project data library   | Included   | Imported/prepared data is reusable across chapters                |
| Seed example data      | Included   | Curated immutable catalog; stories become local editable copies   |
| GeoTIFF preparation    | Included   | rio-cogeo COG creation and validation                             |
| Vector preparation     | Included   | Shapefile/GeoJSON/CSV to GeoParquet or GDAL PMTiles               |
| CSV coordinate mapping | Included   | Common latitude/longitude column names are selected automatically |
| NetCDF / HDF5 prep     | Included   | Author-selected variable and 2D slice to COG                      |
| LAS / LAZ preparation  | Included   | PDAL conversion to COPC                                           |
| GPX preparation        | Included   | Track and timestamps to trajectory sidecar                        |
| Connection discovery   | Included   | Format, size, CORS, ranges, PMTiles layers, Zarr variables        |
| Property styling       | Included   | Category colors and exact-value filters for vector layers         |
| Chapter PNG export     | Included   | Map canvases with visible attribution footer                      |
| Animated map export    | Included   | MP4 where supported, otherwise explicit WebM fallback             |
| macOS / Linux runtime  | Included   | Locked lazy Pixi environments; no separate GDAL installation      |
| Windows x64 runtime    | Included   | Native Pixi bootstrap, locked tools, and Windows CI validation    |

Portable does not mean offline. Zarr stores remain connected because they are
multi-object stores. Basemaps, XYZ tiles, the current GeoParquet WASM
and spatial-extension runtime, and explicit connected overrides can remain network dependencies.
Preflight and the deployment report list those exceptions rather than making an
offline promise.
