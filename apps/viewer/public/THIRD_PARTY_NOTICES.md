# Offline viewer third-party runtime notices

Plus Jakarta Sans and DM Mono are bundled under the SIL Open Font License 1.1.
Their copyright notices and license texts ship as
`credits/PLUS_JAKARTA_SANS_LICENSE` and `credits/DM_MONO_LICENSE`.

The offline GeoParquet runtime contains the exact artifacts below. Checksums
are enforced by `apps/viewer/src/offlineRuntimeAssets.test.ts`.

| Component                     | Version / platform                                                        | Upstream license evidence                                                                                                                                                                     | Redistribution status                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DuckDB-Wasm worker and module | npm `@duckdb/duckdb-wasm` 1.32.0; DuckDB v1.4.3; `wasm_eh` and `wasm_mvp` | MIT: <https://github.com/duckdb/duckdb-wasm/tree/v1.32.0>                                                                                                                                     | Cleared. The version-pinned MIT texts ship as `credits/runtime/DUCKDB_WASM_LICENSE` and `credits/runtime/DUCKDB_LICENSE`.                                                                                                                         |
| DuckDB Parquet extension      | DuckDB v1.4.3; `wasm_eh` and `wasm_mvp`                                   | Signed official artifacts from <https://extensions.duckdb.org/v1.4.3/>; DuckDB source is MIT: <https://github.com/duckdb/duckdb/tree/v1.4.3>                                                  | Cleared. Covered by `credits/runtime/DUCKDB_LICENSE`.                                                                                                                                                                                             |
| DuckDB spatial extension      | DuckDB v1.4.3; `wasm_eh` and `wasm_mvp`                                   | Signed official artifacts from <https://extensions.duckdb.org/v1.4.3/>; extension source is MIT on the DuckDB 1.4 release branch: <https://github.com/duckdb/duckdb-spatial/tree/v1.4-andium> | **Release gate:** inventoried in [the runtime SBOM](offline-runtime-sbom.md). Every embedded component requiring a text notice now ships one; SQLite is public domain and has no text payload. The open item is the LGPL-2.1 GEOS analysis below. |

Full component inventory — every library embedded in the spatial extension,
with versions, licenses, and the evidence for each — is in
[`offline-runtime-sbom.md`](offline-runtime-sbom.md), which ships with the
viewer. The notice payload for each component requiring a text notice ships in
`credits/runtime/`; SQLite is documented as public domain without a payload.

## Copyleft status

One embedded component is not permissive: **GEOS 3.13.0 is LGPL-2.1-only**, and
is statically linked into both spatial extension variants. Its complete license
text ships as `credits/runtime/GEOS_LICENSE`. The binaries are the official,
unmodified, signed upstream artifacts, and the corresponding source and build
manifest are cited in the SBOM. Whether that satisfies LGPL-2.1 §6 for this
distribution method is the one open legal question before public release.

Previously suspected and now ruled out by inspection: libspatialite
(MPL/GPL/LGPL tri-licensed) is **not** linked — the binary reports
`OGR was built without libspatialite support`. libcurl and OpenSSL are likewise
absent from the WASM build.

The worker files preserve their own bundled JavaScript license comments. This
inventory records technical provenance; it is not legal advice.
