# Offline DuckDB runtime component inventory

This is the component SBOM that `apps/viewer/public/THIRD_PARTY_NOTICES.md` and
`docs/release/desktop-release-readiness.md` require before public
redistribution. It covers the vendored artifacts under
`apps/viewer/public/runtime/duckdb`, which ship in the desktop installer and in
**every** offline publication an author exports.

The exact bytes are pinned by size and SHA-256 in
`apps/viewer/src/offlineRuntimeAssets.test.ts`. This document inventories what
is _inside_ those bytes.

## How this inventory was produced

Three independent sources, cross-checked against each other:

1. **Strings extracted from the shipped `.wasm` binaries.** Component version
   banners (`GEOS_VERSION=3.13.0-CAPI-1.19.0`, `GDAL/3.8.5`, PROJ `9.1.1`,
   SQLite `3.49.1`, `libjpeg-turbo version 3.1.0`) and vcpkg build paths
   (`buildtrees/gdal/src/v3.8.5-85bea0e6d1.clean`,
   `buildtrees/tiff/src/v4.7.0-05e0c9997b.clean`) are embedded in the binaries.
2. **The upstream build manifest.** `vcpkg.json` on the `v1.4-andium` branch of
   `duckdb/duckdb-spatial` (commit `14cc57b574a9`), which is the DuckDB 1.4
   release branch that produced the `v1.4.3` extension artifacts.
3. **The vcpkg builtin baseline** `ce613c41372b23b1f51333815feb3edd87ef8a8b`
   named by that manifest, which resolves each port to a version and an SPDX
   license identifier.

Where the binary strings and the baseline disagree, **the binary wins** — the
manifest pins `version>=` floors, and DuckDB's build resolved GDAL and PROJ
below the current baseline. Each row below records which source established it.

## Components

| Component                | Version                  | License                                                     | Evidence                                                                                                                 | Notice shipped                           |
| ------------------------ | ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| DuckDB                   | v1.4.3                   | MIT                                                         | Artifact path `extensions/v1.4.3/`; upstream <https://github.com/duckdb/duckdb/tree/v1.4.3>                              | `credits/runtime/DUCKDB_LICENSE`         |
| DuckDB-Wasm              | 1.32.0                   | MIT                                                         | npm `@duckdb/duckdb-wasm@1.32.0`; upstream <https://github.com/duckdb/duckdb-wasm/tree/v1.32.0>                          | `credits/runtime/DUCKDB_WASM_LICENSE`    |
| DuckDB spatial extension | DuckDB v1.4.3 build      | MIT                                                         | Branch `v1.4-andium` @ `14cc57b574a9`                                                                                    | `credits/runtime/DUCKDB_SPATIAL_LICENSE` |
| GDAL                     | 3.8.5                    | MIT/X11 plus per-component notices in its own `LICENSE.TXT` | Binary: `GDAL/3.8.5`, vcpkg buildtree path                                                                               | `credits/runtime/GDAL_LICENSE`           |
| **GEOS**                 | **3.13.0** (CAPI 1.19.0) | **LGPL-2.1-only**                                           | Binary: `GEOS_VERSION=3.13.0-CAPI-1.19.0`, GEOS C API symbols present; manifest enables GDAL's `geos` feature explicitly | `credits/runtime/GEOS_LICENSE`           |
| PROJ                     | 9.1.1                    | MIT                                                         | Binary version string; manifest floor `version>=9.1.1`                                                                   | `credits/runtime/PROJ_LICENSE`           |
| SQLite                   | 3.49.1                   | Public domain (`blessing`)                                  | Binary version string; manifest dep `sqlite3` with `rtree`                                                               | See note below                           |
| libtiff                  | 4.7.0                    | libtiff (BSD-style)                                         | Binary: `buildtrees/tiff/src/v4.7.0-05e0c9997b.clean`                                                                    | `credits/runtime/LIBTIFF_LICENSE`        |
| libjpeg-turbo            | 3.1.0                    | BSD-3-Clause / IJG                                          | Binary: `libjpeg-turbo version 3.1.0`                                                                                    | `credits/runtime/LIBJPEG_TURBO_LICENSE`  |
| nlohmann/json            | 3.11.3                   | MIT                                                         | Binary: mangled `nlohmann16json_abi_v3_11_3` symbols                                                                     | `credits/runtime/NLOHMANN_JSON_LICENSE`  |
| Expat                    | 2.7.1                    | MIT                                                         | Manifest dep + baseline; binary shows expat diagnostics                                                                  | `credits/runtime/EXPAT_LICENSE`          |
| zlib                     | 1.3.1                    | Zlib                                                        | Manifest dep + baseline; binary shows inflate/deflate paths                                                              | `credits/runtime/ZLIB_LICENSE`           |
| libdeflate               | 1.23                     | MIT                                                         | Baseline (pulled in by libtiff); binary references a libdeflate-enabled build                                            | `credits/runtime/LIBDEFLATE_LICENSE`     |
| libgeotiff               | 1.7.4                    | MIT                                                         | Baseline (GDAL dependency); binary GeoTIFF driver strings                                                                | `credits/runtime/LIBGEOTIFF_LICENSE`     |
| json-c                   | 0.18-20240915            | MIT                                                         | Baseline (GDAL dependency); binary `json-c aborts with error`                                                            | `credits/runtime/JSON_C_LICENSE`         |
| LERC                     | 4.0.4                    | Apache-2.0                                                  | Baseline (GDAL dependency); binary `Unknown Lerc version`                                                                | `credits/runtime/LERC_LICENSE`           |

SQLite is dedicated to the public domain and publishes no license file to
reproduce; its status is recorded here and in the shipped notices rather than as
a text payload.

The LERC row records the baseline port version `4.0.4`. Upstream publishes no
matching tag — vcpkg's port version tracks a commit — so the shipped Apache-2.0
text is taken from the nearest upstream release tag, `v4.0.0`. The license is
unchanged between them.

## Explicitly **not** linked into the WASM build

Each of these was checked against the binary and produced only
"unsupported"/"not built with" diagnostics or no symbols at all. They therefore
carry no notice obligation for this artifact:

- **libspatialite** — binary says `OGR was built without libspatialite support`.
  This matters: libspatialite is MPL/GPL/LGPL tri-licensed and would have been
  the most restrictive component in the tree. It is absent.
- **libcurl** — binary says `without libcurl support`; the manifest excludes
  curl on `wasm32`.
- **OpenSSL** — declared in the manifest but produces zero symbols or version
  strings in the WASM binaries (it is pulled in only for the curl feature,
  which is excluded on `wasm32`).
- **libpng, OpenJPEG, HDF5, netCDF, libwebp** — no linked symbols. The `WEBP`
  and `netCDF` strings present are GDAL driver metadata and CF convention
  labels, not linked implementations.

## The one component that is not permissive: GEOS

GEOS 3.13.0 is **LGPL-2.1-only** and is statically linked into both
`spatial.duckdb_extension.wasm` variants. Every other component above is
permissive (MIT, BSD, Apache-2.0, Zlib, or public domain). This repository ships
the notice payload listed in the table for every component that requires one;
SQLite is public domain and has no text payload.

Facts relevant to the LGPL analysis, recorded so counsel is not asked to
rediscover them:

- The artifacts are the **official, unmodified, signed** upstream binaries from
  <https://extensions.duckdb.org/v1.4.3/>, byte-pinned by the checksum test.
  Earth Stories does not patch, recompile, or relink them.
- The same binaries are publicly distributed by DuckDB itself under the same
  terms, and are reproducible from the public sources and build manifest cited
  above.
- Earth Stories redistributes them verbatim in two paths: the desktop installer
  and every exported offline publication.
- LGPL-2.1 §6 permits distributing a work linked with the library where the
  recipient can relink. The complete corresponding source for GEOS 3.13.0, the
  build manifest, and the pinned toolchain baseline are all public and cited
  here; the shipped notices carry the full LGPL-2.1 text and these source
  references.

**This is the remaining judgment call, and it is a legal one, not a technical
one.** The inventory it depends on is now complete.

## Verification

`apps/viewer/src/runtimeCredits.test.ts` compares the fifteen named notice paths
in this table with the files that travel with the runtime in both directions.
Components that require a text notice cannot be listed without a payload or
shipped without an SBOM entry. SQLite is the documented public-domain exception
and does not have a text payload.
