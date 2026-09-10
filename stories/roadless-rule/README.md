# The Last Roadless Forests

A draft Earth Stories project about the proposed rescission of the 2001
Roadless Rule. This folder is an ordinary Earth Stories project: `story.json`
plus the local data and images it references under `assets/`.

## Open it in the editor

The app lists projects from one parent folder. Point it at this repository's
`stories/` directory and start the app:

```bash
EARTH_STORIES_PROJECTS_DIR=$PWD/stories yarn dev
```

Then open **The Last Roadless Forests** from the workspace. Alternatively copy
this folder into your usual `earth-stories-projects/` directory.

## Status

Comments on the proposed rule (docket FS-2025-0001, 91 FR 53827) close on
2026-09-21. The 18-chapter story is publication-ready. Narrative figures were
checked on 2026-09-10; see `SOURCES.md` for every claim, its source, and the
verdict from the fact-check pass.

## Data in this folder

| File                                    | What it is                                                                                                      | How it was made                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `assets/roadless-us-simplified.geojson` | All 11,391 inventoried roadless areas from the 2001 rule, simplified for a national view, with a `status` field | GDAL from USFS EDW `S_USA.RoadlessArea_2001`, simplify 0.003°, 3-decimal coordinates |
| `assets/roadless-areas.pmtiles`         | The same layer as vector tiles, zoom 0 to 10, for zoomed-in chapters                                            | GDAL PMTiles driver, tile extent 2048                                                |
| `assets/roadless-tongass.geojson`       | The 684 Tongass polygons (9.34 M acres) at higher resolution                                                    | Filter `FOREST='Tongass'`, simplify 0.0005°                                          |
| `assets/national-forests.pmtiles`       | 112 administrative forest boundaries, zoom 0 to 9                                                               | GDAL from USFS EDW `S_USA.AdministrativeForest`                                      |
| `assets/roadless-by-state.csv`          | Roadless acres for the twelve largest states, tagged national vs state rule                                     | SQL sum over the 2001 layer                                                          |
| `assets/lumber-ppi-monthly.csv`         | BLS producer price index for softwood lumber, 2015-01 to 2026-08                                                | FRED series WPU0811                                                                  |
| `assets/southeast-alaska-jobs.csv`      | Visitor industry vs timber jobs and wages, 2024                                                                 | Transcribed from Southeast Conference, _Southeast Alaska by the Numbers 2025_        |
| `assets/usda-dollars-at-stake.csv`      | USDA's revenue and recreation estimates from the proposed rule, plus the Tongass annual loss                    | 91 FR 53827; Taxpayers for Common Sense (2020)                                       |
| `assets/opposition-to-repeal.csv`       | Share opposed in comments and polls                                                                             | Center for Western Priorities; Pew/Susquehanna; Colorado College                     |
| `assets/ignition-density.csv`           | Wildfire ignitions per 1,000 ha by setting                                                                      | Aplet, Hartger and Dietz, _Fire Ecology_ (2026)                                      |

Status field: polygons in Idaho and Colorado are labelled
`State rule (unaffected)` because the proposal keeps the 2008 Idaho and 2012
Colorado rules in force; everything else is `National rule (proposed
rescission)`. The national subset sums to 44,701,002 acres, which matches the
44.7 million acres in the proposed rule.

Vector PMTiles polygons intentionally render as outlines, so the filled national
and Tongass views use the GeoJSON copies and the PMTiles copy is used for detail
at high zoom. The project includes `share-card.png` for social link previews;
generated publication directories remain rebuildable and are not committed.

## Images

All photographs are public domain U.S. Forest Service images except
`mt-adams-dark-divide.jpg` (Wikimedia Commons, CC BY-SA 4.0). Source pages are
recorded in each image source's provenance in `story.json`. Files were resized
to 1,800 px wide.
