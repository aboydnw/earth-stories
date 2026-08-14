# Offline publication runtime prerequisites

## Production network inventory before this spike

The viewer had these runtime network paths in addition to its own static files:

- `GeoParquetOverlay` selected DuckDB-Wasm from
  `https://cdn.jsdelivr.net`, fetched its worker and Wasm module, and loaded the
  Parquet and spatial extensions from `https://extensions.duckdb.org`.
- `CogOverlay` called `@developmentseed/proj`'s `epsgResolver` for every numeric
  CRS. That resolver fetches `https://epsg.io/<code>.json` unless its process
  global cache was already populated.
- The configured basemap `styleUrl` can use any HTTP(S) origin and its style can
  transitively reference further tile, sprite, glyph, and source origins.
- Connected asset `href` values are requested from their configured origins;
  XYZ templates can fan out into one or more tile origins, and remote COG,
  PMTiles, GeoParquet, COPC, Zarr, image, CSV, GeoJSON, and trajectory locators
  retain their configured origins.
- Terrain requests `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`; 3D
  buildings request `https://tiles.openfreemap.org/planet` and the sources that
  TileJSON declares.
- YouTube chapters embed `https://www.youtube-nocookie.com/embed/<id>` and
  Vimeo chapters embed `https://player.vimeo.com/video/<id>`; either embed may
  request additional provider-controlled origins.

These non-runtime paths remain explicit work for the offline profile phases;
this prerequisite spike does not relabel existing connected, portable, or
custom publications as offline.

## Proven runtime baseline

The installed npm package `@duckdb/duckdb-wasm` 1.32.0 reports DuckDB v1.4.3.
The viewer now resolves its MVP and exception-handling worker/module pairs
relative to the publication and sets a publication-relative custom extension
repository before `INSTALL spatial; LOAD spatial;`. DuckDB autoloads Parquet
from that same local repository. The mirrored signed extension layout is:

`runtime/duckdb/extensions/v1.4.3/<wasm_eh|wasm_mvp>/<spatial|parquet>.duckdb_extension.wasm`

The exception-handling extension is 23,469,719 bytes with SHA-256
`04b776946da64a15a7b14501790c75093e38f876acc46b2922f0daeb6aaa1d60`.
The MVP extension is 23,338,062 bytes with SHA-256
`7a745cfc5259f69b46f077bc6afeb7a6aefb8ef8d8b336bb0b770e5449708bb4`.
Runtime files remain lazy: ordinary stories include the static files in their
folder but do not fetch or instantiate them unless a GeoParquet overlay mounts.

A project COG source can now carry `{ cog: { epsg, definition } }`; compilation
copies it into the publication asset. Both COG preparation and the production
deck.gl COG layer use that embedded proj4 definition. A mismatch fails closed;
only a legacy COG with no embedded metadata may invoke `epsgResolver`. The
compiler retains the epsg.io dependency whenever any COG lacks metadata.

The production-boundary tests cover URL/SQL generation, projection resolution,
exact-byte checksums, legacy schema compatibility, and the production build.
`yarn test:offline-runtime` additionally serves a candidate on an ephemeral
loopback port, disables caches, bypasses service workers, and fails every
HTTP(S) request whose exact scheme, host, or port differs. With a fresh Chrome
profile it hydrates every chapter in the field-notes fixture plus a GeoParquet
overlay and EPSG:32618 COG, requires both maps to become ready, and observes the
local worker, Wasm, Parquet, and spatial files. The proof passes with 24
same-origin paths and no outside-origin attempt. COG and GeoParquet readiness is
emitted only after layer initialization and a deck.gl render; the verifier then
asserts WebGL and observes two additional animation frames before accepting the
result. Linux uses a fresh Xvfb display when available so the production WebGL
path is exercised.

## Measured payload

The eight runtime artifacts total 127,942,764 bytes uncompressed. Before this
spike, the representative built viewer folder was 5,286,535 bytes. After the
runtime/configuration change, a fresh representative build measured
133,233,361 bytes total, including 127,942,764 runtime bytes and before story
data. The non-runtime viewer payload is 5,290,597 bytes. HTTP compression and
filesystem/ZIP metadata are not included. The two browser variants are retained
for compatibility; a later verified materializer may include only a proven
target variant if its browser support contract becomes explicit.

## Redistribution status

The runtime notice is shipped as `THIRD_PARTY_NOTICES.md`. DuckDB-Wasm and the
Parquet extension are from the MIT-licensed DuckDB project, but public release
remains gated on a version-pinned component SBOM/license payload and review of
the spatial binary's bundled GDAL/transitive notices. This spike records that
uncertainty rather than claiming clearance.
