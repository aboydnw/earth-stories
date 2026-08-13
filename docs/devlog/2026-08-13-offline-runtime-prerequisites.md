# Offline publication runtime prerequisites

## Production network inventory before this spike

The viewer had these implicit runtime dependencies in addition to manifest
data and basemap URLs:

- `GeoParquetOverlay` selected DuckDB-Wasm from jsDelivr, fetched its worker,
  instantiated its Wasm module, and ran `INSTALL spatial; LOAD spatial;`, which
  loaded the spatial extension from DuckDB's public extension repository.
- `CogOverlay` called `@developmentseed/proj`'s `epsgResolver` for every numeric
  CRS. That resolver fetches `https://epsg.io/<code>.json` unless its process
  global cache was already populated.
- `MapChapter` has remote terrain and building locators, and publication
  basemaps, connected data sources, Zarr, and remote video can also request the
  network. These remain explicit work for the offline profile phases; this
  prerequisite spike does not relabel existing connected, portable, or custom
  publications as offline.

## Proven runtime baseline

The installed npm package `@duckdb/duckdb-wasm` 1.32.0 reports DuckDB v1.4.3.
The viewer now resolves its MVP and exception-handling worker/module pairs
relative to the publication and sets a publication-relative custom extension
repository before `INSTALL spatial; LOAD spatial;`. The mirrored signed
extension layout is:

`runtime/duckdb/extensions/v1.4.3/<wasm_eh|wasm_mvp>/spatial.duckdb_extension.wasm`

The exception-handling extension is 23,469,719 bytes with SHA-256
`04b776946da64a15a7b14501790c75093e38f876acc46b2922f0daeb6aaa1d60`.
The MVP extension is 23,338,062 bytes with SHA-256
`7a745cfc5259f69b46f077bc6afeb7a6aefb8ef8d8b336bb0b770e5449708bb4`.
Runtime files remain lazy: ordinary stories include the static files in their
folder but do not fetch or instantiate them unless a GeoParquet overlay mounts.

A project COG source can now carry `{ cog: { epsg, definition } }`; compilation
copies it into the publication asset. A matching numeric CRS uses that embedded
proj4 definition and never invokes `epsgResolver`. The compiler retains the
epsg.io dependency whenever any COG lacks embedded metadata, while WKT and
legacy unmatched numeric CRS behavior is unchanged.

These claims are covered at the production boundary by URL/SQL generation,
projection-resolution, exact-byte checksum, legacy-schema, and production-build
tests. This spike does **not** yet satisfy Phase 0's browser exit criterion: the
repository has no GeoParquet browser fixture or exact-origin request-denial
harness that renders both GeoParquet and the projected COG. Until that proof is
added and passes, this is runtime prerequisite evidence rather than a verified
offline publication.

## Measured payload

The six runtime artifacts total 122,030,421 bytes uncompressed. Before this
spike, the representative built viewer folder was 5,286,535 bytes. After the
runtime/configuration change, a fresh representative build measured
127,319,821 bytes total, including 122,030,421 runtime bytes and before story
data. HTTP compression and filesystem/ZIP metadata are not included. The two
browser variants are retained for compatibility; a later
verified materializer may include only a proven target variant if its browser
support contract becomes explicit.

## Redistribution status

The runtime notice is shipped as `THIRD_PARTY_NOTICES.md`. DuckDB-Wasm declares
MIT, but public release remains gated on generating a component SBOM and
reviewing the spatial binary's bundled GDAL/transitive notices. This spike
records that uncertainty rather than claiming clearance.
