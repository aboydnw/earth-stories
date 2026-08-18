# HIFLD Live Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both bundled HIFLD stories match the live catalog and clearly disclose upstream source limitations.

**Architecture:** Keep the shared `hifldSource` builder for connected vector archives, but model Generating Units as an included CSV because the live dataset is non-spatial. Protect the distinction with focused story-contract tests and keep live network checks outside the default test suite.

**Tech Stack:** TypeScript, Vitest, Earth Stories project schema, CSV example assets, HIFLD JSON API and PMTiles storage.

## Global Constraints

- Preserve exactly 12 chapters in each story.
- Preserve prose, map, scrolly, chart, flyover, and image coverage in each story.
- Use HIFLD v1.0.0 URLs exactly as returned by the live API on 2026-08-18.
- Do not represent non-spatial Generating Units records as a map layer.
- Do not claim Earth Stories repaired HIFLD's upstream geometry-quality failures.
- Do not make the default unit test suite depend on network availability.

---

### Task 1: Lock the live source contract with failing tests

**Files:**

- Modify: `apps/local-service/src/hifldExamples.test.ts`

**Interfaces:**

- Consumes: `findExampleStory(storyId: string)` and `storyProjectSchema`.
- Produces: regression coverage for the connected PMTiles set, the included Generating Units summary, audited dates, and the corrected chapter type.

- [ ] **Step 1: Write the failing source tests**

Replace the single `expectedSources` map with a connected-only map whose tsunami slug is `historical-tsunami-event-locations-` and which omits `generating-units`. Add literal assertions:

```ts
expect(source.provenance.accessedAt).toBe("2026-08-18");

const units = grid.sources.find(({ id }) => id === "generating-units");
expect(units).toMatchObject({
  kind: "csv",
  path: "assets/generating-units.csv",
  delivery: "included",
  provenance: {
    dataUpdatedAt: "2023-09-01",
    accessedAt: "2026-08-18",
  },
});

expect(
  grid.chapters.find(({ id }) => id === "grid-generating-units"),
).toMatchObject({
  type: "chart",
  sourceId: "generating-units",
  xColumn: "technology_family",
  yColumn: "unit_count",
});
```

Add literal temporal-coverage assertions for earthquakes (`2008-12-31`), tsunami events (`2025-12-31`), tsunami observations (`2005-12-31`), significant volcanic events (`2024-12-31`), and alternative fueling stations (`2025-10-22`).

- [ ] **Step 2: Run the focused test and verify RED**

Run: `yarn vitest run apps/local-service/src/hifldExamples.test.ts`

Expected: FAIL because the tsunami slug lacks the trailing hyphen, Generating Units is still PMTiles, audited dates are old, and the chapter is still a map.

- [ ] **Step 3: Commit the failing contract**

```bash
git add apps/local-service/src/hifldExamples.test.ts
git commit -m "test: capture live HIFLD source contracts"
```

### Task 2: Correct sources, story structure, and bundled data

**Files:**

- Modify: `apps/local-service/src/hifldExamples.ts`
- Modify: `apps/local-service/src/exampleAssets.ts`
- Create: `apps/local-service/src/example-assets/example-electric-grid/generating-units.csv`
- Modify: `apps/local-service/src/hifldExamples.test.ts`

**Interfaces:**

- Consumes: the literal contracts added in Task 1 and the live HIFLD Generating Units v1.0.0 GeoJSON.
- Produces: a schema-valid `StoryProject` whose `generating-units` source is a bundled CSV with columns `technology_family`, `unit_count`, and `summer_capacity_mw`.

- [ ] **Step 1: Build the summarized CSV from the live table**

Download the version-pinned GeoJSON returned by the HIFLD file API. Group
`TYPE` values into Coal, Natural gas, Hydroelectric, Nuclear, Wind, Solar,
Petroleum, Biomass and waste, Geothermal, and Other and storage. For each
family, count every record, exclude the 159 non-positive capacity sentinels
from `SUMMER_CAP` sums, and write the hand-auditable CSV ordered by descending
`unit_count`.

- [ ] **Step 2: Make the minimal story changes**

Set the tsunami slug to `historical-tsunami-event-locations-`. Replace the Generating Units `hifldSource(...)` call with:

```ts
{
  id: "generating-units",
  kind: "csv",
  label: "Generating units by technology",
  path: "assets/generating-units.csv",
  attribution: "EIA / HIFLD Next, summarized by Earth Stories",
  sizeBytes: null,
  delivery: "included",
  provenance: {
    ...createDefaultSourceProvenance(),
    publisher: "U.S. Energy Information Administration / HIFLD Next",
    sourceUrl:
      "https://hifld.publicenvirodata.org/storage/generating-units-1/generating-units-1/v1.0.0/geojson/generating-units-1-geojson.geojson",
    dataUpdatedAt: "2023-09-01",
    accessedAt: "2026-08-18",
    spatialCoverage: "United States",
    transformations: [
      "Grouped 32,344 generating-unit records into ten technology families",
      "Mapped TYPE values into the documented technology families",
      "Counted units and summed SUMMER_CAP within each family",
      "Excluded 159 non-positive sentinel values from capacity sums while retaining those records in unit counts",
      "Rounded summer capacity totals to the nearest whole megawatt",
    ],
  },
}
```

Convert `grid-generating-units` to a bar chart using `technology_family` and
`unit_count`. Update its narrative so unit count is not confused with capacity,
and update the closing source count.

- [ ] **Step 3: Refresh audited provenance and quality caveats**

Set `accessedAt` and story `updated` to `2026-08-18`; apply the literal temporal end dates from Task 1; update Alternative Fueling Stations to the 2025 snapshot horizon. Add short caveats to the governance and gas-pipeline chapters describing HIFLD's upstream quality flags and invalid-geometry counts.

- [ ] **Step 4: Register the bundled asset**

Add `generating-units.csv` to the `example-electric-grid` entry in
`EXAMPLE_ASSET_FILES`.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `yarn vitest run apps/local-service/src/hifldExamples.test.ts apps/local-service/src/examples.test.ts`

Expected: PASS with both stories compiling and all included assets materializing.

- [ ] **Step 6: Commit the corrected stories**

```bash
git add apps/local-service/src/hifldExamples.ts apps/local-service/src/hifldExamples.test.ts apps/local-service/src/exampleAssets.ts apps/local-service/src/example-assets/example-electric-grid/generating-units.csv
git commit -m "fix: align HIFLD examples with live catalog"
```

### Task 3: Replace outage assumptions and verify delivery

**Files:**

- Modify: `docs/examples.md`

**Interfaces:**

- Consumes: the corrected source inventory and the 2026-08-18 live audit evidence.
- Produces: maintainer documentation that separates connected PMTiles, included derived data, and upstream quality limitations.

- [ ] **Step 1: Update the example documentation**

Replace the outage-era assumed-URL section with a verified-live section. Document the trailing-hyphen tsunami slug, the non-spatial Generating Units summary, the audit date, eight connected grid PMTiles, seven earthquake PMTiles, and the four upstream quality flags.

- [ ] **Step 2: Run documentation and source scans**

Run: `rg -n "anticipated|assumed API|historical-tsunami-event-locations(?!-)" apps/local-service/src/hifldExamples.ts docs/examples.md --pcre2`

Expected: no stale assumption language or uncorrected tsunami slug.

- [ ] **Step 3: Run full local verification**

Run sequentially:

```bash
yarn test
yarn typecheck
yarn build
```

Expected: all commands exit 0.

- [ ] **Step 4: Run the live endpoint audit**

For every connected HIFLD source, request its API record and PMTiles headers. Expected: all API records return 200; all PMTiles return 200 with `application/octet-stream` and `Accept-Ranges: bytes`. Verify the non-spatial Generating Units file record exposes no PMTiles source.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/examples.md docs/superpowers/plans/2026-08-18-hifld-live-corrections.md
git commit -m "docs: record verified HIFLD example sources"
```
