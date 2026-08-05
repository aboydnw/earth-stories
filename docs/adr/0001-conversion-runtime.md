# ADR 0001: Local conversion runtime

- Status: Accepted
- Date: 2026-08-05

## Context

Earth Stories must prepare legacy and scientific geospatial inputs locally without recreating CNG Sandbox's hosted ingestion stack or requiring authors to install native tools. The runtime must support macOS and Linux first, remain viable on Windows x64, avoid a monolithic first-run download, and expose a stable boundary to the Node service.

A spike compared GDAL 3.13's PMTiles writer with tippecanoe 2.79 on 4,000 mixed GeoJSON features, 150,000 Shapefile lines, and 60,000 attribute-heavy CSV points. GDAL handled all inputs directly and preserved attributes, but its fixed 0–5 defaults need explicit profiles and its zoom-14 runs were slower. Tippecanoe generalized more aggressively and was faster, but required Shapefile normalization, failed its normal configuration on the attribute-heavy CSV, and has no conda-forge Windows build.

DuckDB Spatial wrote GeoParquet with `geo` metadata from all three inputs substantially faster than the Python dataframe stack. It discovers CRS metadata, supports explicit transforms and geometry repair, but its reader failed a valid CP1252 Shapefile that GDAL/OGR decoded correctly.

## Decision

Use a pinned Pixi/conda-forge runtime. Bootstrap Pixi at an exact version only after verifying its published SHA-256 digest, commit locks for each supported platform, and validate them in CI.

Use GDAL PMTiles generation for v1 with tested, data-driven zoom, simplification, feature-density, attribute-selection, and tile-size profiles. Do not include tippecanoe in the v1 runtime; reconsider it later as an optional macOS/Linux enhancement.

Use DuckDB Spatial as the primary Shapefile, GeoJSON, and CSV to GeoParquet engine. Use GDAL/OGR as the compatibility fallback for encodings, drivers, and CRS cases DuckDB cannot safely normalize. Do not require GeoPandas initially.

Provision capability environments lazily: `core`, `vector`, `raster` (GDAL, rasterio, rio-cogeo), `multidim` (xarray, NetCDF/HDF5, Zarr), and `pointcloud` (PDAL). Provisioning is a first-class job stage with size disclosure, progress, cache reuse, retry, and actionable failures. GeoTIFF conversion uses rio-cogeo and its validator, and credits rio-cogeo to authors.

Define the versioned inspect/configure/prepare/verify worker protocol in JSON Schema and generate TypeScript and Pydantic models with contract tests.

Support Apple Silicon macOS and Linux x64 first, then Intel macOS and Windows x64. Keep paths, process control, and locks Windows-safe from the first protocol version.

## Consequences

Authors receive reproducible, local conversion without a monolithic install. Windows remains feasible because v1 does not depend on tippecanoe. Multiple environments and GDAL fallback add orchestration and CI work. Pixi's cache makes failed provisioning retryable, but true byte-range continuation is not guaranteed; if required, packaged runtime archives will need a resumable downloader. PMTiles profiles require viewer-based golden tests because neither tool's defaults are acceptable across all datasets.
