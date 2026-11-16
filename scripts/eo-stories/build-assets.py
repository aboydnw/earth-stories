"""Build small, attributed story assets. No downloads or invented observations.
Usage: python build-assets.py /path/to/svalbard_frontal_ablation.nc /path/to/svalbard_frontal_ablation.gpkg
Requires h5py, numpy, matplotlib and GDAL ogr2ogr. Source record 22129588 (v4), CC BY 4.0.
"""
import csv
import hashlib
import sys
from datetime import datetime, timedelta
from pathlib import Path
import h5py
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[2] / 'apps/local-service/src/example-assets'
source = Path(sys.argv[1])
assert hashlib.md5(source.read_bytes()).hexdigest() == '9eb462e1285a50f75d572f72e6cb4632', 'Expected Zenodo v4 NetCDF'
plt.rcParams.update({'font.family': 'DejaVu Sans', 'text.color': '#e2e9e7', 'axes.labelcolor': '#e2e9e7', 'xtick.color': '#b7c7c9', 'ytick.color': '#b7c7c9', 'axes.edgecolor': '#44606a'})
with h5py.File(source) as f:
    i = list(f['rgi_id'][:]).index(b'RGI60-07.01464')
    assert f['Name'][i] == b'Kronebreen'
    dates = [datetime(1970, 1, 1) + timedelta(days=float(d)) for d in f['time'][:]]
    values, unc = f['fa'][i], f['fa_unc'][i]
    gap, interp = f['is_gap'][i].astype(bool), f['fac_interpolated'][i].astype(bool)
    assert f['fa'].attrs['units'] == b'Gt yr-1'
    folder = ROOT / 'example-edge-of-ice'; folder.mkdir(parents=True, exist_ok=True)
    with (folder / 'kronebreen-monthly.csv').open('w') as out:
        writer = csv.writer(out); writer.writerow(['month', 'frontal_ablation_gt_per_year', 'uncertainty_gt_per_year', 'geometry_missing', 'area_change_interpolated'])
        for d, v, u, g, p in zip(dates, values, unc, gap, interp):
            writer.writerow([d.strftime('%Y-%m'), '' if not np.isfinite(v) else float(v), '' if not np.isfinite(u) else float(u), int(g), int(p)])
    fig, (ax, coverage) = plt.subplots(2, 1, figsize=(14, 8), gridspec_kw={'height_ratios': [5, 1]}, sharex=True, facecolor='#102b36')
    for a in (ax, coverage): a.set_facecolor('#102b36'); a.spines[['top', 'right']].set_visible(False)
    valid = np.isfinite(values) & np.isfinite(unc)
    ordinary = valid & ~interp
    for mask, color, marker, label in [(ordinary, '#90d9d4', 'o', 'Available geometry interval'), (valid & interp, '#e9bd7c', 'D', 'Area change interpolated')]:
        ax.errorbar(np.array(dates)[mask], values[mask], yerr=unc[mask], fmt=marker, markersize=3, elinewidth=.7, alpha=.85, color=color, label=label)
    ax.set_ylabel('Frontal ablation rate (Gt/year)'); ax.grid(axis='y', alpha=.12)
    ax.set_title('KRONEBREEN  /  A record with visible gaps', loc='left', color='#edf3ef', fontsize=22, pad=25)
    ax.legend(facecolor='#102b36', labelcolor='#e2e9e7', edgecolor='none', loc='upper left', fontsize=9)
    coverage.scatter(dates, np.zeros(len(dates)), c=np.where(gap, '#e9bd7c', '#90d9d4'), marker='|', s=300)
    coverage.set_yticks([]); coverage.set_ylabel('Geometry'); coverage.set_xlabel('Monthly intervals, February 2015 – December 2024')
    fig.text(.125, .045, 'Amber ticks: missing geometry. Bars: source-reported uncertainty. Points are not connected across gaps.\nPyles et al. (2026), Zenodo v4 · CC BY 4.0 · Not total glacier mass loss.', color='#b7c7c9', fontsize=10)
    fig.subplots_adjust(bottom=.19, hspace=.18); fig.savefig(folder / 'kronebreen-record.png', dpi=130, facecolor=fig.get_facecolor()); plt.close(fig)

# Editorial diagrams, deliberately not geographical data or measured fractions.
for slug, title, subtitle, labels, colors in [
    ('beyond-tree-cover', 'ONE WORD. DIFFERENT LANDSCAPES.', 'Conceptual key, not a mapped place or class distribution', ['Primary forest', 'Naturally regenerating', 'Planted forest', 'Plantation forest', 'Tree crops / agroforestry', 'Other land'], ['#1b7837','#7fbf7b','#1d91c0','#e65fa9','#e6ab02','#fde278']),
    ('a-place-rewritten', 'A PLACE CAN HOLD MANY PARTS.', 'Conceptual composition, not observed area or change', ['Forest', 'Grassland', 'Shrubland', 'Wetland', 'Cropland', 'Built landscape'], ['#467e65','#b7ba70','#7d945d','#63a7a0','#d8ac76','#b99aaa'])]:
    folder = ROOT / ('example-' + slug); folder.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(14, 8), facecolor='#f5f0e7'); ax.set_facecolor('#f5f0e7'); ax.set_xlim(0, 14); ax.set_ylim(0, 8); ax.axis('off')
    ax.text(.7, 7.25, title, color='#183b38', fontsize=23, weight='bold'); ax.text(.7, 6.65, subtitle, color='#55655b', fontsize=13)
    for j, (label, color) in enumerate(zip(labels, colors)):
        x=.7+(j%3)*4.35; y=3.65-(j//3)*2.5
        ax.add_patch(plt.Rectangle((x,y),3.9,1.65,color=color,alpha=.95))
        ax.text(x, y-.38, label, color='#183b38', fontsize=12)
    ax.text(.7,.25,'EDITORIAL PROTOTYPE  ·  DATA LAYER NOT YET CONNECTED',color='#645340',fontsize=11)
    fig.savefig(folder / 'concept.png', dpi=130, facecolor=fig.get_facecolor()); plt.close(fig)

# Actual monthly front geometries, not illustrative glacier outlines.
import json
import subprocess
import tempfile
geopackage = Path(sys.argv[2])
assert hashlib.md5(geopackage.read_bytes()).hexdigest() == '830e473af026b99bd9daaf3efbf8be69', 'Expected Zenodo v4 GeoPackage'
with tempfile.TemporaryDirectory() as tmp:
    selected = Path(tmp) / 'fronts.json'
    subprocess.run(['ogr2ogr', '-f', 'GeoJSON', str(selected), str(geopackage), 'sval_monthly_termini', '-where', "rgiid = 'RGI60-07.01464'"], check=True)
    features = json.loads(selected.read_text())['features']
    assert len(features) == 114
    fig, ax = plt.subplots(figsize=(14,8), facecolor='#102b36'); ax.set_facecolor('#102b36')
    for feature in sorted(features, key=lambda f: (f['properties']['year'], f['properties']['month'])):
        p = feature['properties']; t = (p['year'] - 2015 + (p['month'] - 1) / 12) / 10
        for line in feature['geometry']['coordinates']:
            xy = np.array(line) / 1000
            ax.plot(xy[:,0], xy[:,1], color=plt.cm.YlGnBu(.2 + .5*(1-t)), lw=.75, alpha=.75)
    for year, month, color, label in [(2015,1,'#f4df9b','January 2015'),(2024,12,'#ffffff','December 2024')]:
        feature = next(f for f in features if f['properties']['year']==year and f['properties']['month']==month)
        for j,line in enumerate(feature['geometry']['coordinates']):
            xy=np.array(line)/1000; ax.plot(xy[:,0],xy[:,1],color=color,lw=2,label=label if j==0 else None)
    ax.set_aspect('equal'); ax.set_xlabel('Easting (km, UTM zone 33N)'); ax.set_ylabel('Northing (km)'); ax.spines[['top','right']].set_visible(False)
    ax.set_title('KRONEBREEN  /  An edge with a memory',loc='left',color='#edf3ef',fontsize=22,pad=25)
    ax.legend(facecolor='#102b36',labelcolor='#e2e9e7',edgecolor='none',loc='upper left')
    fig.text(.125,.045,'114 available monthly fronts, January 2015 – December 2024. Six missing months have no invented outline.\nPyles et al. (2026), Zenodo v4 · CC BY 4.0 · Model-derived, monthly averaged Sentinel-1 segmentations.',fontsize=10,color='#b7c7c9')
    fig.subplots_adjust(bottom=.19); fig.savefig(ROOT/'example-edge-of-ice'/'kronebreen-fronts.png',dpi=130,facecolor=fig.get_facecolor()); plt.close(fig)

# Bind the inspected front coverage to the exact derived files in this edition.
folder = ROOT / 'example-edge-of-ice'
front_months = sorted(f"{f['properties']['year']:04d}-{f['properties']['month']:02d}" for f in features)
assert len(set(front_months)) == len(front_months)
evidence = {
    'record': 'https://zenodo.org/records/22129588',
    'rgiId': 'RGI60-07.01464',
    'frontMonths': front_months,
    'sha256': {name: hashlib.sha256((folder / name).read_bytes()).hexdigest() for name in ['kronebreen-fronts.png', 'kronebreen-record.png', 'kronebreen-monthly.csv']},
}
(folder / 'kronebreen-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
