# Kronebreen geographic front subset

The interactive Edge of Ice map uses **satellite-derived monthly average front linework**, not a
reconstruction of a moving ice edge. It is not a glacier polygon, ice thickness,
flow field, or calibrated retreat distance.

- Source: [Svalbard frontal ablation, v4](https://zenodo.org/records/22129588).
- Source file: `svalbard_frontal_ablation.gpkg`, MD5
  `830e473af026b99bd9daaf3efbf8be69`.
- Layer: `sval_monthly_termini`; filter: `rgiid = 'RGI60-07.01464'`.
- 114 MultiLineString records, January 2015 through December 2024.
- Missing front months: March–July 2015 and December 2015.
- Native coordinates: EPSG:32633 (WGS 84 / UTM zone 33N).
- Export: EPSG:4326 longitude, latitude, using pyproj with `always_xy=True`.
  All 92,261 source vertices are retained; coordinates are serialized to seven
  decimal places (at most about a centimetre in latitude), with no simplification
  or interpolated geometry.
- The first/latest date roles identify January 2015 and December 2024,
  respectively. Overlaid traces compare source geometries; animation between sections
  must not imply observed movement or a measured monthly trajectory.
- The associated rate CSV is a separate evidence product: its missing-geometry
  and area-interpolation flags remain visible. Front availability does not imply
  that a frontal-ablation estimate is uninterpolated.

Reproduce without downloading the other source files:

```sh
curl --fail -L https://zenodo.org/api/records/22129588/files/svalbard_frontal_ablation.gpkg/content -o /tmp/svalbard_frontal_ablation.gpkg
uv run --with shapely==2.2.0 --with pyproj==3.8.0 python scripts/eo-stories/build-fronts.py /tmp/svalbard_frontal_ablation.gpkg
```

The exporter refuses an unexpected source hash, CRS, geometry type, front count,
or date list. It records source/projection details and the resulting GeoJSON SHA256
in `kronebreen-evidence.json`. `build-assets.py` calls this exporter after
regenerating the original static figures and CSV.
