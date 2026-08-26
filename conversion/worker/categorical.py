"""Detect categorical rasters via GDAL color tables, RATs, or a unique-value heuristic."""

from __future__ import annotations

from pathlib import Path
from typing import Any

MAX_UNIQUE_VALUES = 30
HEURISTIC_INT_DTYPES = frozenset(
    {"uint8", "int8", "uint16", "int16", "uint32", "int32"}
)
QUALITATIVE_PALETTE = [
    "#4E79A7",
    "#F28E2B",
    "#E15759",
    "#76B7B2",
    "#59A14F",
    "#EDC948",
    "#B07AA1",
    "#FF9DA7",
    "#9C755F",
    "#BAB0AC",
    "#86BCB6",
    "#8CD17D",
    "#B6992D",
    "#499894",
    "#D37295",
    "#D4A6C8",
    "#FABFD2",
    "#B3E2CD",
    "#F1CE63",
    "#A0CBE8",
]


def _palette_color(index: int) -> str:
    return QUALITATIVE_PALETTE[index % len(QUALITATIVE_PALETTE)]


def _read_sample(src, band: int = 1):
    """Read a band at its coarsest overview, or a decimated full read if it has none."""
    overviews = src.overviews(band)
    if overviews:
        level = overviews[-1]
        return src.read(
            band,
            out_shape=(max(1, src.height // level), max(1, src.width // level)),
        )
    target = 512
    if src.height <= target and src.width <= target:
        return src.read(band)
    return src.read(
        band, out_shape=(min(target, src.height), min(target, src.width))
    )


def _from_color_table(src, nodata) -> list[dict[str, Any]]:
    import numpy as np

    try:
        table = src.colormap(1)
    except Exception:
        return []
    entries = {k: v for k, v in table.items() if v != (0, 0, 0, 255)}
    if not entries:
        return []
    present = {int(value) for value in np.unique(_read_sample(src))}
    if nodata is not None:
        present.discard(int(nodata))
    return [
        {
            "value": int(value),
            "color": "#%02X%02X%02X" % tuple(rgba[:3]),
            "label": f"Class {value}",
        }
        for value, rgba in sorted(entries.items())
        if value in present and not (len(rgba) >= 4 and rgba[3] == 0)
    ]


def _from_rat(path: Path, nodata) -> list[dict[str, Any]]:
    try:
        from osgeo import gdal
    except ImportError:
        return []
    dataset = gdal.Open(str(path))
    if not dataset:
        return []
    rat = dataset.GetRasterBand(1).GetDefaultRAT()
    if not rat or rat.GetRowCount() == 0:
        return []
    label_column = next(
        (
            index
            for index in range(rat.GetColumnCount())
            if rat.GetNameOfCol(index).lower()
            in ("class", "name", "label", "description", "category")
        ),
        -1,
    )
    categories: list[dict[str, Any]] = []
    for row in range(rat.GetRowCount()):
        value = int(rat.GetValueAsInt(row, 0))
        if nodata is not None and value == int(nodata):
            continue
        label = (
            rat.GetValueAsString(row, label_column)
            if label_column >= 0
            else f"Class {value}"
        )
        categories.append(
            {"value": value, "color": _palette_color(row), "label": label}
        )
    return categories


def _from_heuristic(src, nodata, dtype: str) -> list[dict[str, Any]]:
    if dtype not in HEURISTIC_INT_DTYPES:
        return []
    import numpy as np

    unique = np.unique(_read_sample(src))
    if nodata is not None:
        unique = unique[unique != int(nodata)]
    if len(unique) > MAX_UNIQUE_VALUES:
        return []
    return [
        {
            "value": int(value),
            "color": _palette_color(index),
            "label": f"Class {value}",
        }
        for index, value in enumerate(sorted(unique))
    ]


def detect_categories(path: Path) -> list[dict[str, Any]]:
    """Return category entries for a single-band categorical raster, else an empty list.

    Three tiers, first match wins: GDAL color table, GDAL raster attribute
    table, then an integer-dtype heuristic capped at 30 distinct values.
    """
    import rasterio

    with rasterio.open(path) as src:
        if src.count != 1:
            return []
        nodata = src.nodata
        dtype = str(src.dtypes[0])
        tiers = (
            lambda: _from_color_table(src, nodata),
            lambda: _from_rat(path, nodata),
            lambda: _from_heuristic(src, nodata, dtype),
        )
        for tier in tiers:
            try:
                categories = tier()
            except Exception:
                continue
            if categories:
                return categories
    return []


if __name__ == "__main__":
    import json
    import sys

    print(json.dumps(detect_categories(Path(sys.argv[1]))))
