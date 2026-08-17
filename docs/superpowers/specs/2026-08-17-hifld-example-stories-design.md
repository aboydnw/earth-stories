# HIFLD example stories design

## Outcome

Ship two editable, network-required example stories in the local catalog:

- `example-earthquakes` — **The Ground Remembers**
- `example-electric-grid` — **The Grid Between Us**

Each story contains 12 chapters and deliberately exercises prose, map,
scrolly, chart, flyover, and image chapters. The examples are configured as
though the missing HIFLD Next datasets had completed the same ingestion flow
as the live `hospitals-3` dataset.

## HIFLD connection contract

HIFLD Next currently exposes only `hospitals-3`, but that live record establishes
the storage convention used by the examples:

```text
https://hifld.publicenvirodata.org/storage/<dataset>/<file>/<version>/pmtiles/<file>.pmtiles
```

For these examples the dataset and file slug are identical and the first
anticipated immutable release is pinned as `v1.0.0`. Sources therefore use:

```text
https://hifld.publicenvirodata.org/storage/<slug>/<slug>/v1.0.0/pmtiles/<slug>.pmtiles
```

The source provenance link uses the corresponding anticipated dataset API URL:

```text
https://hifld.publicenvirodata.org/api/collections/hifld/datasets/<slug>
```

These are intentionally not availability-tested in the catalog test while the
HIFLD ingestion outage persists. Explicit versioning makes the intended source
snapshot reproducible once the records return. PMTiles `sourceLayer` remains
`null` so the viewer reads `vector_layers` metadata from each archive.

## Earthquake story

### Chapters

1. Prose — The planet is never still
2. Map — A global record of rupture
3. Chart — The history of observation
4. Scrolly — Where plates meet
5. Flyover — Around the Ring of Fire
6. Map — Faults beneath the United States
7. Chart — Magnitude is not consequence
8. Scrolly — When the ocean carries the shock
9. Image — When the map becomes a road
10. Scrolly — Antakya, block by block
11. Map — Hazards share a landscape
12. Prose — What the archive remembers

### Sources

- HIFLD Historical Significant Earthquake Locations
- HIFLD Plate Boundaries
- HIFLD Historical Holocene Volcano Locations
- HIFLD Quaternary Fault Lines
- HIFLD Historical Tsunami Event Locations
- HIFLD Historical Tsunami Observations
- HIFLD Historical Significant Volcanic Event Locations
- OpenAerialMap Antakya cloud-optimized GeoTIFF
- NCEI-derived earthquake archive counts CSV
- NCEI-derived selected event consequences CSV
- USGS public-domain 1964 Alaska earthquake image

The included CSVs are snapshots computed from NCEI's Significant Earthquakes
ArcGIS layer on 2026-08-17. The history chart groups 6,631 records into six
broad periods. Its prose must explicitly say the catalog is shaped by surviving
written records and modern instrumentation, so it cannot establish that
earthquakes are becoming more frequent. The consequence chart compares six
events and uses a logarithmic fatalities axis; reported death totals include
downstream effects and carry the uncertainties of historical disaster records.

Fault lines show evidence of Quaternary surface deformation, not predictions.
Tsunami and volcanic overlays show associated hazard records, not proof that
mere proximity establishes causation.

## Electricity story

### Chapters

1. Prose — Electricity begins somewhere
2. Map — Thousands of places making power
3. Chart — The fuels behind the switch
4. Scrolly — A different grid in every region
5. Map — One plant, many machines
6. Flyover — The long-distance grid
7. Map — Who keeps the system connected
8. Scrolly — The boundaries customers inherit
9. Scrolly — The pipeline behind the power line
10. Image — The hardware behind the abstraction
11. Map — Electricity moves onto the road
12. Prose — What this map cannot tell us

### Sources

- HIFLD Power Plants
- HIFLD Generating Units
- HIFLD Transmission Lines
- HIFLD NERC Regions
- HIFLD NERC Reliability Coordinators
- HIFLD Electric Retail Service Territories
- HIFLD Electric Planning Areas
- HIFLD Natural Gas Interstate and Intrastate Pipelines
- HIFLD Alternative Fueling Stations
- HIFLD-derived power capacity by fuel-family CSV
- USGS public-domain wind, solar, and transmission image

The capacity CSV is an included snapshot aggregated from the public
HIFLD-derived `Power_Plants` ArcGIS service on 2026-08-17. It sums the
`SUMMER_CAP` field by a documented grouping of `PRIMARY_FU` codes. The chart is
historical context, not a statement of current generation: plant count,
capacity, and actual output are different quantities.

Transmission geometry does not show electrical flow, loading, congestion,
outages, or real-time condition. Retail, planning, and NERC boundaries describe
responsibility rather than hard electrical walls. Pipeline proximity does not
prove plant supply, and the pipeline layer is explicitly described as an
archived January 2020 view. Alternative-fueling points do not establish charger
operation, utilization, price, or local grid capacity.

## Bundled assets

The following exact filenames are copied into an editable project. Their stems
match their source IDs so publication compilation resolves them correctly.

```text
example-earthquakes/earthquake-history.csv
example-earthquakes/earthquake-consequences.csv
example-earthquakes/alaska-earthquake-damage.jpg
example-electric-grid/generation-by-fuel.csv
example-electric-grid/energy-hardware.png
```

## Acceptance criteria

- Both examples appear in the catalog with 12 chapters and
  `network-required` authoring status.
- Every story validates against `earth-stories/project/v2` and compiles through
  the publisher.
- Each story contains all six approved chapter types.
- Every HIFLD source is connected, version-pinned to the expected `v1.0.0`
  PMTiles path, and has a matching HIFLD API provenance URL.
- All included image and CSV sources have non-empty bundled files whose names
  match their source IDs.
- Source and chapter prose preserves the factual limits above.
