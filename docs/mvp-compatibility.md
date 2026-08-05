# MVP compatibility

This matrix is intentionally smaller than CNG Sandbox. Unsupported features
must be rejected explicitly rather than silently changed during export.

| Capability             | MVP status | Initial behavior                                              |
| ---------------------- | ---------- | ------------------------------------------------------------- |
| Prose chapter          | Included   | Rendered as authored                                          |
| Map chapter            | Included   | One primary layer and camera state                            |
| Scrollytelling chapter | Included   | Sticky map layout in shared viewer                            |
| Image chapter          | Included   | Project-owned image copied into publication                   |
| Basic chart chapter    | Included   | Bar/line presentation from included CSV                       |
| Public or local COG    | Rendered   | Direct range-request rendering; connected or included         |
| PMTiles                | Rendered   | Vector/raster archive rendering with discovered source layers |
| GeoJSON                | Included   | Imported, copied, and rendered in map                         |
| GeoParquet             | Rendered   | In-browser DuckDB spatial rendering up to 100k features       |
| XYZ raster             | Included   | Connected external dependency                                 |
| Zarr                   | Deferred   | Explicit compatibility error                                  |
| COPC                   | Deferred   | Explicit compatibility error                                  |
| Trajectory             | Deferred   | Explicit compatibility error                                  |
| Flyover / terrain      | Deferred   | Explicit compatibility error                                  |
| Offline guarantee      | Deferred   | No offline claim                                              |
| Direct publishing      | Deferred   | User deploys latest folder or ZIP                             |
| Latest folder build    | Included   | Recoverable replacement in project folder                     |
| Archival HTML          | Included   | One self-contained preservation document                      |
| Iframe embed           | Included   | Fixed-height scrollport via `embed.html`                      |
| Publication history    | Deferred   | Latest successful release only                                |
| Example stories        | Included   | Curated templates become independent editable local projects  |
| Example connections    | Included   | Public supported sources can be added to any story            |
| Connected profile      | Included   | Remote sources remain dependencies                            |
| Portable profile       | Included   | Compatible geospatial files copied locally                    |
| Custom profile         | Included   | Per-asset delivery overrides are authoritative                |

Portable does not mean offline. Basemaps, XYZ tiles, the current GeoParquet WASM
and spatial-extension runtime, and explicit connected overrides can remain network dependencies.
Preflight and the deployment report list those exceptions rather than making an
offline promise.
