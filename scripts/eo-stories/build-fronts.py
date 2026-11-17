#!/usr/bin/env python3
"""Export observed Kronebreen fronts from the pinned v4 source, without interpolation.

Run: uv run --with shapely==2.2.0 --with pyproj==3.8.0 python \
  scripts/eo-stories/build-fronts.py /path/to/svalbard_frontal_ablation.gpkg
The full source is intentionally not committed. Requires its published MD5.
"""
import hashlib
import json
from pathlib import Path
import sqlite3
import struct
import sys

from pyproj import Transformer
from shapely import from_wkb
from shapely.ops import transform

SOURCE_MD5 = "830e473af026b99bd9daaf3efbf8be69"
RGI_ID = "RGI60-07.01464"
TABLE = "sval_monthly_termini"
ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "apps/local-service/src/example-assets/example-edge-of-ice"


def export_fronts(source: Path, output: Path = OUTPUT):
    with source.open("rb") as stream:
        actual = hashlib.file_digest(stream, "md5").hexdigest()
    if actual != SOURCE_MD5:
        raise ValueError("GeoPackage does not match the pinned Zenodo v4 checksum")
    transformer = Transformer.from_crs(32633, 4326, always_xy=True)
    with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as db:
        column, geometry_type, srs_id = db.execute(
            "SELECT column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns WHERE table_name=?",
            (TABLE,),
        ).fetchone()
        if geometry_type != "MULTILINESTRING" or srs_id != 32633:
            raise ValueError("Unexpected source geometry or coordinate reference system")
        # Column/table come from the checksum-pinned database, not external input.
        rows = db.execute(
            f'SELECT year, month, "{column}" FROM "{TABLE}" WHERE rgiid=? ORDER BY year, month',
            (RGI_ID,),
        ).fetchall()
    features = []
    for year, month, blob in rows:
        if blob[:2] != b"GP" or blob[2] != 0:
            raise ValueError("Invalid GeoPackage binary geometry")
        flags = blob[3]
        envelope_type = (flags >> 1) & 7
        envelope_size = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get(envelope_type)
        if envelope_size is None or flags & 0x30:
            raise ValueError("Empty or extended GeoPackage geometry")
        header_srs = struct.unpack("<i" if flags & 1 else ">i", blob[4:8])[0]
        if header_srs != 32633:
            raise ValueError("Geometry has unexpected CRS")
        native = from_wkb(blob[8 + envelope_size:])
        if native.is_empty or native.geom_type != "MultiLineString":
            raise ValueError("Expected nonempty observed front")
        projected = transform(transformer.transform, native)
        west, south, east, north = projected.bounds
        if not (11 < west <= east < 14 and 78 < south <= north < 80):
            raise ValueError("Front falls outside Kronebreen geographic bounds")
        date = f"{int(year):04d}-{int(month):02d}"
        features.append({
            "type": "Feature",
            "id": f"kronebreen-{date}",
            "properties": {
                "month": date, "year": int(year), "monthNumber": int(month),
                "rgiId": RGI_ID,
                "dateRole": "first" if date == "2015-01" else "latest" if date == "2024-12" else "record",
            },
            "geometry": {
                "type": "MultiLineString",
                "coordinates": [
                    [[round(x, 7), round(y, 7)] for x, y in line.coords]
                    for line in projected.geoms
                ],
            },
        })
    months = [f["properties"]["month"] for f in features]
    if len(features) != 114 or len(set(months)) != 114 or months[0] != "2015-01" or months[-1] != "2024-12":
        raise ValueError("Source coverage differs from the verified 114-front record")
    output.mkdir(parents=True, exist_ok=True)
    destination = output / "kronebreen-fronts.geojson"
    destination.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"), allow_nan=False) + "\n")
    evidence_path = output / "kronebreen-evidence.json"
    evidence = json.loads(evidence_path.read_text())
    if evidence["frontMonths"] != months:
        raise ValueError("Front dates do not match existing source evidence")
    evidence["sha256"][destination.name] = hashlib.sha256(destination.read_bytes()).hexdigest()
    evidence["frontGeometry"] = {
        "source": "https://zenodo.org/records/22129588",
        "file": "svalbard_frontal_ablation.gpkg",
        "md5": SOURCE_MD5,
        "layer": TABLE,
        "sourceCrs": "EPSG:32633",
        "outputCrs": "EPSG:4326",
        "coordinateOrder": "longitude, latitude",
        "coordinatePrecisionDecimalPlaces": 7,
        "transformation": "pyproj 3.8.0, always_xy=True",
        "simplification": False,
        "interpolation": False,
        "missingMonths": [
            f"{year:04d}-{month:02d}" for year in range(2015, 2025) for month in range(1, 13)
            if f"{year:04d}-{month:02d}" not in months
        ],
    }
    evidence_path.write_text(json.dumps(evidence, indent=2) + "\n")
    print(f"{len(features)} observed fronts exported to {destination} ({destination.stat().st_size} bytes)")


if __name__ == "__main__":
    export_fronts(Path(sys.argv[1]))
