# HIFLD Live Corrections Design

## Goal

Make the two bundled HIFLD stories agree with the live HIFLD catalog as of
2026-08-18 while preserving their 12-chapter editorial structures, dataset
variety, and supported chapter-type coverage.

## Confirmed live findings

- Fourteen of the sixteen configured HIFLD PMTiles URLs exist and support byte
  ranges.
- Historical Tsunami Event Locations uses the catalog and file slug
  `historical-tsunami-event-locations-`, including its trailing hyphen.
- Generating Units has 32,344 tabular records but no PMTiles source and no
  usable geometry. HIFLD publishes it as GeoJSON, GeoPackage, and file
  geodatabase only.
- The configured access date predates this audit, and several temporal ranges
  used the access date as if it were the latest event date.
- HIFLD marks the PMTiles quality check as failed for Reliability Coordinators,
  Electric Retail Service Territories, Electric Planning Areas, and Natural
  Gas Pipelines. The first three report 6, 254, and 20 invalid geometries,
  respectively; the pipeline record reports no invalid geometry and does not
  expose the reason for the failed overall check.

## Chosen approach

Correct the tsunami slug at the shared HIFLD source boundary. Keep Generating
Units in the story as a distinct dataset, but summarize its non-spatial records
into an included CSV and render the former plant/unit map chapter as a chart.
This preserves the dataset and tells a claim the source can actually support.

The summary will group the live `TYPE` values into ten reader-facing technology
families and include both unit count and summer capacity. All 32,344 records
remain in unit counts; 159 non-positive capacity sentinels are excluded only
from capacity sums. The existing capacity chart remains based on the separate
historical power-plants service, so the two chapters contrast facility capacity
with the number of individual generating machines rather than presenting the
same measure twice.

Alternatives rejected:

- Removing Generating Units would reduce the dataset variety the examples were
  designed to demonstrate.
- Treating its GeoJSON as a connected map source would retain the same failure:
  its features have no usable geometry.
- Manufacturing coordinates by joining units to plants would be a derived
  geospatial dataset and would imply a precision the source does not provide.

## Story and provenance changes

- Advance the story `updated` and all audited `accessedAt` values to
  `2026-08-18`.
- Use the live archive years for historical HIFLD event coverage:
  significant earthquakes through 2008, tsunami events through 2025, tsunami
  observations through 2005, and significant volcanic events through 2024.
- Record Generating Units as an included CSV derived from the HIFLD v1.0.0
  GeoJSON, with its 2023-09-01 source date and explicit grouping/summing
  transformations.
- Update Alternative Fueling Stations from the guessed 2024 cutoff to the
  archive's 2025 record horizon and describe it as a preserved snapshot rather
  than live station status.
- Add concise caveats to the affected electricity chapters and example
  documentation for HIFLD's failed upstream quality flags. Do not describe
  those flags as transformations or claim Earth Stories repaired the data.
- Update closing copy to count eight connected HIFLD PMTiles plus one included
  HIFLD-derived generating-units summary.

## Tests and verification

The static tests will distinguish mappable HIFLD sources from the non-spatial
Generating Units source. They will assert the authoritative trailing-hyphen
tsunami URL, the included generating-units asset and chart contract, audited
dates, valid chapter references, and successful publication compilation.

Verification will include the focused example tests, the full test suite,
typechecking, production builds, and a live HTTP audit of every configured
HIFLD API and PMTiles URL. Network checks remain outside the default unit suite
so ordinary development is not made flaky by service availability.
