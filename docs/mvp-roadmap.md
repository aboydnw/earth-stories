# MVP implementation roadmap

## Phase 1 — Independent foundation (complete)

- Independent Earth Stories repository and package namespace
- Separate authoring and publication schemas
- Deterministic compiler and shared preview/publication viewer
- Representative fixture, CI, and independence guard

## Phase 2 — Local project lifecycle (complete)

- Loopback-only service and ordinary project folders
- Create, list, open, validate, and atomic save
- Timestamped safety backups and contained local asset access

## Phase 3 — Authoring breadth (complete)

- Prose, map, sticky scrollytelling, image, and CSV chart chapters
- Local asset import and public source connection
- Per-source automatic, included, and connected delivery policies
- Live preview through the authoritative publication renderer

## Phase 4 — Portable publication (complete)

- Static viewer build packaged with publication manifest and included assets
- Latest folder and ZIP outputs from the local editor
- Self-contained archival HTML with Dublin Core metadata
- Fixed-scrollport iframe output and deployment-aware embed snippet
- Publication preflight, included-size estimates, and actionable findings
- External dependency and deployment report
- Explicit compatibility failures for invalid source/chapter combinations

## Phase 5 — MVP hardening (complete for pilot)

- Schema, compiler, project-store, asset-safety, and policy tests
- Type checking, reproducible production builds, and CI enforcement
- User, architecture, compatibility, and troubleshooting documentation

## Phase 6 — Storytelling and publication depth

- Connected, portable, and custom publication profiles selected at publish time
- Per-asset policy overrides with size, network, CORS, and byte-range preflight
- Direct browser rendering for COG, vector/raster PMTiles, and GeoParquet
- Layer opacity, vector colors, point radius, COG band/rescale/colormap, legends,
  source-layer selection, and attribution
- Camera position, pitch, bearing, map/scrolly presentation, chapter reorder,
  duplication, deletion, story credits, basemap, and publication-theme controls
- Profile-aware folder, ZIP, archive, and embed outputs with deployment reports
- Ordered chapter overlays; embedded video; multi-series, ranged, and log charts
- Globe, terrain, buildings, and scroll-driven flyover camera keyframes
- Direct connected Zarr rendering with temporal controls, COPC streaming, and
  trajectory playback controls

## Phase 7 — Pilot-ready starting points

- Built-in example-story catalog with independent, editable local copies
- Curated public COG, PMTiles, Zarr, and COPC connections that can be added to
  any story
- First-run guidance and actionable local-service startup diagnostics
- Local COG import through the same shared preview and publication renderer
- Post-build verification of publication entrypoints, manifest, and included assets

## Phase 8 — Local data preparation and library (complete)

- Project-local reusable data library and immutable seeded example data
- Raw GeoTIFF, Shapefile, GeoJSON, CSV, NetCDF, HDF5, LAS/LAZ, and GPX intake
- DuckDB Spatial vector preparation, GDAL PMTiles, rio-cogeo COG validation,
  xarray 2D slice selection, PDAL COPC, and trajectory sidecars
- Lazily provisioned, pinned Pixi capability environments for macOS and Linux
- Versioned JSON Schema job protocol with generated TypeScript/Pydantic models
- Progress, size disclosure, retry, verification, and explicit tool credits

## Phase 9 — Discovery and data-specific controls (complete)

- URL format, CORS, byte-range, and size inspection before connecting
- PMTiles zoom/source-layer and consolidated Zarr variable/dimension discovery
- Vector property colors and exact-value filters across GeoJSON, GeoParquet, and PMTiles
- COG band/range/color-ramp controls, Zarr variable/time/slice controls,
  COPC color/size controls, and trajectory playback
- Shared schema presentation state in editor preview and every publication output

## Phase 10 — Reader, output, and pilot parity (complete)

- CNG-derived reader typography, reading progress, sticky scrollytelling cards,
  responsive fallbacks, and reduced-motion behavior
- Attributed chapter PNGs and browser-native MP4/WebM temporal capture
- Dynamic-map archival fallbacks and verified folder/ZIP/archive/embed builds
- End-to-end pilot workflow and data-preparation documentation
- Full schema, contract, project safety, compiler, publication, UI-token,
  independence, type, build, fixture, and Storybook gates

## After MVP

Observed pilot usability sessions come next. Native installers, direct deployment
integrations, offline guarantees, collaboration, and AI assistance require
separate product decisions and support commitments.
