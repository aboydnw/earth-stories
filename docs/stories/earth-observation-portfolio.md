# Earth observation portfolio: first authoring edition

These three examples are editable stories in the normal Earth Stories catalog,
using the shared viewer and publication compiler. This is **not** a completed
portfolio deployment or three shipped exploration apps. Nothing is deployed.

## What is real today

- **Edge of Ice** selects Kronebreen, RGI60-07.01464, from Pyles et al.'s
  [Svalbard dataset v4](https://zenodo.org/records/22129588). Its two bundled
  figures show the 114 available monthly front geometries and 119 monthly
  ablation intervals. The CSV retains rate, uncertainty, missing-geometry and
  interpolated-area-change flags. All are derived from downloaded source files,
  not invented demonstration values. No interactive front map exists yet.
- **Beyond Tree Cover** is an explicitly labeled editorial prototype with an
  original conceptual class key. It does not contain ForTy imagery, regional
  classification, class probabilities, or a working explorer.
- **A Place, Rewritten** is an explicitly labeled editorial prototype with an
  original conceptual composition diagram. It does not contain local ecosystem
  fractions, an annual map, or a working explorer.

The prototypes deliberately do not show made-up places, data, or functioning
controls. The title, opening chapter and image captions repeat their status.
The original diagrams have equal-sized panels for legibility; panel area is not
measured area. Stories are short, chapter-addressable, and avoid mandatory
scroll-animation sequences. Interactive, connected transitions remain future
work, rather than a new one-off viewer implementation.

## Rebuild the ice evidence and conceptual diagrams

Use Python with `h5py`, `numpy`, `matplotlib` and GDAL's `ogr2ogr`. Download these
files from the v4 record, then run:

```sh
python scripts/eo-stories/build-assets.py /path/to/svalbard_frontal_ablation.nc /path/to/svalbard_frontal_ablation.gpkg
```

The script validates upstream MD5 checksums (integrity checks, not signatures):

| Input                            | MD5                                |
| -------------------------------- | ---------------------------------- |
| `svalbard_frontal_ablation.nc`   | `9eb462e1285a50f75d572f72e6cb4632` |
| `svalbard_frontal_ablation.gpkg` | `830e473af026b99bd9daaf3efbf8be69` |

Only the small derived assets are bundled. No 257-MB GeoPackage is shipped.
The front layer is `sval_monthly_termini`, `rgiid = RGI60-07.01464`, native
EPSG:32633. No coordinate resampling, smoothing, or missing geometry synthesis
is performed. Native metres are divided by 1,000 for figure axes. The monthly
fronts are model-derived average segmentations, not individual calving events.

The NetCDF rates begin February 2015, while the geometry series begins January 2015. Rates retain `Gt yr-1` units, **not Gt per month**. `is_gap` and
`fac_interpolated` are different: the latter can include the interval ending at
an available outline. The figure shows individual source uncertainty bars,
without inventing a confidence level or joining points across missing months.
Frontal ablation is not complete glacier mass balance. Source: Pyles et al.,
[A decade of monthly frontal ablation](https://essd.copernicus.org/articles/18/7319/2026/),
CC BY 4.0. Checked 2026-11-16.

## Data acquisition gates before the other stories become mapped case studies

### Beyond Tree Cover

[ForTy v1 archive](https://doi.org/10.25452/figshare.plus.32288616), CC BY 4.0,
contains zipped UTM archives of five-band COGs. The API metadata was checked
2026-11-16. [Producer documentation](https://developers.google.com/earth-engine/datasets/catalog/projects_nature-trace_assets_forest_typology_forest_typology_2020_v1_0_collection)
confirms 2020, 10-metre pixels, five stored scores from 0 to 250, and a sixth
Other Land score obtained as the complement. The scores are uncalibrated.

Before publishing a geographical edition:

1. Select a documented regional case and obtain a bounded COG subset. Do not
   send multi-gigabyte global/UTM ZIPs to a reader's device.
2. Verify band order, nodata, score bounds and sum, projection, and class names.
3. Match or disclose imagery year, and validate local claims independently.
4. Include full creator citation. The producer catalog still contains a
   `[PLACEHOLDER ATTRIBUTION]` string; do not copy that as final attribution.
5. Implement a real reveal + score inspection before writing reader prompts
   that imply those controls exist.

### A Place, Rewritten

[Du and Yu's archive](https://doi.org/10.5281/zenodo.19448555), CC BY 4.0,
contains a 5-KB `EFGs` Earth Engine script rather than raster downloads. It
merges `projects/ee-duzhenrong03-04/assets/Ecosystem/EFGs` and
`projects/ee-duzhenrong03-06/assets/Ecosystem/EFGs`, filters on `year`, and
illustrates argmax display. The paper remains a
[preprint under review](https://essd.copernicus.org/preprints/essd-2026-791/).

Before publication, obtain authorized bounded GEE exports, verify annual
coverage, class ordering, fraction scale, masks, area weighting and uncertainty.
Preserve fractional data rather than deriving a time series from only argmax
colors. The conceptual panels are not the paper's complete class list.
Choose a documented landscape and corroborate explanations with local evidence.
Do not infer ecological health, biodiversity, parcel-level change or causation.

## Companion apps and reusable contract

1. **Svalbard Front Explorer:** two-date front comparison, available-month
   strip, optional trails, separate ablation panel, download source subset.
2. **Forest Lens:** same-place imagery/classification reveal with dated imagery,
   click-to-inspect competing scores, methodological caveats close to results.
3. **Ecosystem Time Machine:** two-year comparison, cell and area-weighted region
   composition, optional playback, versioned annual coverage and CSV export.

Use explicit shareable state: story/chapter ID, dataset version, selected area,
selected dates, active layers. “Explore this view” should preserve that state;
“Return to story” should restore the chapter. These apps are proposals, not
functional links. No new MCP work, public deployment, credentials, or paid
services are introduced by this change.

## Provenance and evidence validation

The two original conceptual diagrams are repository-created work under the
[MIT license](../../LICENSE), not derivatives of the dataset rasters. Their
source provenance points at this repository; external data records remain
separate narrative citations. Scientific figures and CSV retain CC BY 4.0
attribution. Template author metadata is intentionally blank so the person
editing/publishing a copy can choose their attribution.

`kronebreen-evidence.json` is generated from the checksummed GeoPackage and
records its exact available months and SHA-256 hashes of both scientific PNGs
and the CSV. Tests compare this coverage with every CSV geometry flag and the
headline counts, verify file digests, decode PNG scanline payloads and check
chunk CRCs. Caption caveats are asserted explicitly.

The source record explicitly describes a multi-temporal segmentation model
applied to Sentinel-1 SAR and monthly-averaged fronts. Thus the caption's
“model-derived monthly average fronts” is source-supported; it is not a claim
that these are directly observed daily calving events.

## Figure readability

The Kronebreen chapters repeat the axes, units, shapes and coverage key as
normal text lists, so readers do not need to decipher a scaled raster legend.
The shared image dialog also links to the original image in a new tab for
browser zoom or saving. This is not an interactive data table or explorer.
Actual phone/desktop browser QA remains outstanding: the local preview was
unreachable from the available browser, whose URL policy then rejected access.

## Bounded ForTy v1 acquisition verified (2026-11-17)

The [Source Cooperative mirror](https://source.coop/epoch/forest-typology-2020/README.md)
provides individual unchanged COGs, so the large Figshare ZIPs are no longer an
acquisition blocker. Its `v1/items.parquet` index was downloaded and queried for
116.21°E, 33.31°S, the **producer documentation's example map center** in
southwestern Australia. This is a reproducible technical candidate, not an
independently validated local history or a representative global sample.

The matching tile is
[`raster_50H_20_16_7.tif`](https://data.source.coop/epoch/forest-typology-2020/v1/50H/raster_50H_20_16_7.tif),
3,034,593 bytes. SHA-256:
`30b04d220bc9a96c2b481ce5e50d785a96626a5cb6e8503477b5bc4d87d7218e`.
A 1,024-byte range request returned HTTP 206 and `Access-Control-Allow-Origin: *`.
This verifies HTTP range/CORS behavior, not a browser renderer.

The full tile decoded successfully: five uint8 bands, 2,864 × 4,512 pixels,
EPSG:32750, 10-metre resolution, NoData 255, positive Y scale (rows run south to
north). All 12,922,368 pixels were valid; stored scores ranged from 0 to 249 and
five-band sums from 0 to 249. Rendering must honor the signed transform, not
silently treat the raw array as north-up. Reproduce with Python, NumPy and Rasterio:

```sh
python scripts/eo-stories/test_probe_forty.py
python scripts/eo-stories/probe-forty.py /path/to/raster_50H_20_16_7.tif
```

The probe pins source bytes, preserves valid zero, masks any NoData band, widens
before summing, rejects invalid scores/sums, and calculates the sixth class
before argmax. It does not modify stories, publish data, or substitute the
seven-band **v2 beta** series. The mirror and producer identify v1 as CC BY 4.0;
retain Neumann et al.'s dataset and paper attribution and distinguish mirror
hosting from authorship.

**Still outstanding:** choose a bounded scene within this or another documented
landscape, check it against independent local evidence and dated imagery, then
produce a properly attributed map and competing-score view. Beyond Tree Cover
remains an editorial prototype until those steps are complete. A tile's model
labels alone do not establish forest management history, health or legal status.
