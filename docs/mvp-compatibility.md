# MVP compatibility

This matrix is intentionally smaller than CNG Sandbox. Unsupported features
must be rejected explicitly rather than silently changed during export.

| Capability             | MVP status    | Initial behavior                            |
| ---------------------- | ------------- | ------------------------------------------- |
| Prose chapter          | Included      | Rendered as authored                        |
| Map chapter            | Included      | One primary layer and camera state          |
| Scrollytelling chapter | Planned       | Same viewer in preview and publication      |
| Image chapter          | Planned       | Project-owned image copied into publication |
| Basic chart chapter    | Planned       | Publication-owned tabular payload           |
| Public COG             | Planned       | Connected and checked for browser access    |
| PMTiles                | First fixture | Connected or included per asset policy      |
| GeoJSON                | First fixture | Included when small                         |
| GeoParquet             | Planned       | Connected or included per asset policy      |
| XYZ raster             | Included      | Connected external dependency               |
| Zarr                   | Deferred      | Explicit compatibility error                |
| COPC                   | Deferred      | Explicit compatibility error                |
| Trajectory             | Deferred      | Explicit compatibility error                |
| Flyover / terrain      | Deferred      | Explicit compatibility error                |
| Offline guarantee      | Deferred      | No offline claim                            |
| Direct publishing      | Deferred      | Export folder or ZIP only                   |
