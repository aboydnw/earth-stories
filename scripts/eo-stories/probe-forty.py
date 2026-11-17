"""Validate a bounded ForTy v1 input, without inventing a local story.

Download SOURCE_URL, then run with Python + numpy + rasterio:
  python scripts/eo-stories/probe-forty.py tile.tif
Prints reproducible evidence; does not download or modify story assets.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import rasterio

SOURCE_URL = 'https://data.source.coop/epoch/forest-typology-2020/v1/50H/raster_50H_20_16_7.tif'
SHA256 = '30b04d220bc9a96c2b481ce5e50d785a96626a5cb6e8503477b5bc4d87d7218e'


def classify_v1(bands):
    """Return zero-based classes; -1 means NoData, including partial-band NoData.

    Scores are uncalibrated. Ties resolve to the first class in source order.
    Widen before summing to prevent uint8 overflow; zero remains valid.
    """
    if bands.shape[0] != 5:
        raise ValueError('ForTy v1 requires exactly five bands, not v2 beta')
    valid = np.all(bands != 255, axis=0)
    if np.any((bands[:, valid] < 0) | (bands[:, valid] > 250)):
        raise ValueError('Out-of-range v1 score')
    totals = bands.astype(np.int32).sum(axis=0)
    if np.any(totals[valid] > 250):
        raise ValueError('Scores exceed 250; do not clamp or silently renormalize')
    scores = np.concatenate([bands.astype(np.int32), (250 - totals)[None]], axis=0)
    return np.where(valid, scores.argmax(axis=0), -1)


def main(path):
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != SHA256:
        raise ValueError('Expected pinned v1 tile bytes')
    with rasterio.open(path) as source:
        if (source.count, source.width, source.height) != (5, 2864, 4512):
            raise ValueError('Unexpected source shape')
        if source.crs.to_epsg() != 32750 or source.nodata != 255:
            raise ValueError('Unexpected CRS or NoData')
        if tuple(source.transform)[:6] != (10, 0, 415680, 0, 10, 6286240):
            raise ValueError('Unexpected transform; source rows run south to north')
        classes = classify_v1(source.read())
        print(json.dumps({
            'source': SOURCE_URL, 'sha256': SHA256, 'bytes': len(raw),
            'version': 'v1', 'year': 2020, 'crs': 'EPSG:32750',
            'transform': list(source.transform)[:6],
            'validPixels': int((classes >= 0).sum()),
            'noDataPixels': int((classes < 0).sum()),
            'classPixelsInSourceOrder': [int((classes == n).sum()) for n in range(6)],
            'warning': 'Model classes, not independent local validation. No imagery or change claim.'
        }, indent=2))


if __name__ == '__main__':
    main(sys.argv[1])
