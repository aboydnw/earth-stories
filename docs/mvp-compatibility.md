# MVP compatibility

This matrix is intentionally smaller than CNG Sandbox. Unsupported features
must be rejected explicitly rather than silently changed during export.

| Capability             | MVP status   | Initial behavior                            |
| ---------------------- | ------------ | ------------------------------------------- |
| Prose chapter          | Included     | Rendered as authored                        |
| Map chapter            | Included     | One primary layer and camera state          |
| Scrollytelling chapter | Included     | Sticky map layout in shared viewer          |
| Image chapter          | Included     | Project-owned image copied into publication |
| Basic chart chapter    | Included     | Bar/line presentation from included CSV     |
| Public COG             | Connected    | Preserved, reported, and linked from map    |
| PMTiles                | Pass-through | Connected or included per asset policy      |
| GeoJSON                | Included     | Imported, copied, and rendered in map       |
| GeoParquet             | Pass-through | Connected or included per asset policy      |
| XYZ raster             | Included     | Connected external dependency               |
| Zarr                   | Deferred     | Explicit compatibility error                |
| COPC                   | Deferred     | Explicit compatibility error                |
| Trajectory             | Deferred     | Explicit compatibility error                |
| Flyover / terrain      | Deferred     | Explicit compatibility error                |
| Offline guarantee      | Deferred     | No offline claim                            |
| Direct publishing      | Deferred     | Downloadable static ZIP only                |

“Pass-through” means the publication preserves the browser-ready source and its
delivery requirements without converting it. Generic styling of arbitrary
vector PMTiles/GeoParquet and client-side COG raster decoding require additional
source metadata and are post-MVP renderer work; the MVP reader exposes the
source link instead of silently drawing an empty layer.
