# HIFLD Example Stories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two complete, editable HIFLD example stories—earthquakes and the U.S. electricity grid—to the built-in Earth Stories catalog.

**Architecture:** Keep the large existing catalog file stable by defining both related templates and the HIFLD URL/provenance helper in a focused `hifldExamples.ts` module. The existing catalog imports the two `StoryProject` objects, while the existing template-asset loader receives the five included CSV/image files. Tests validate schema compilation, exact version-pinned connection conventions, chapter diversity, provenance, and asset coverage without requiring the currently incomplete HIFLD API to answer.

**Tech Stack:** TypeScript, Zod story schema, Vitest, Earth Stories publisher, PMTiles, local CSV/image template assets.

## Global Constraints

- Preserve all unrelated work and do not modify the user's dirty primary checkout.
- Use the anticipated immutable HIFLD Next path `https://hifld.publicenvirodata.org/storage/<slug>/<slug>/v1.0.0/pmtiles/<slug>.pmtiles`.
- Use the anticipated provenance URL `https://hifld.publicenvirodata.org/api/collections/hifld/datasets/<slug>`.
- Do not perform live availability assertions against missing HIFLD records.
- Keep every image/CSV filename equal to `<sourceId>.<extension>`.
- Preserve the limitations and uncertainty statements in the approved design.
- Do not add runtime dependencies.

---

### Task 1: Specify the two catalog templates in tests

**Files:**

- Create: `apps/local-service/src/hifldExamples.test.ts`
- Test: `apps/local-service/src/examples.test.ts`

**Interfaces:**

- Consumes: `findExampleStory(id: string): StoryProject | null`, `storyProjectSchema`, and `compileProject`.
- Produces: Executable requirements for `earthquakes` and `electric-grid` catalog entries.

- [ ] **Step 1: Write the failing catalog contract tests**

```ts
import { describe, expect, it } from "vitest";
import { compileProject } from "@earth-stories/publisher";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { findExampleStory } from "./examples.js";

const expectedSources = {
  earthquakes: [
    "significant-earthquakes",
    "plate-boundaries",
    "holocene-volcanoes",
    "quaternary-faults",
    "tsunami-events",
    "tsunami-observations",
    "significant-volcanic-events",
  ],
  "electric-grid": [
    "power-plants",
    "generating-units",
    "transmission-lines",
    "nerc-regions",
    "reliability-coordinators",
    "retail-service-territories",
    "electric-planning-areas",
    "natural-gas-pipelines",
    "alternative-fueling-stations",
  ],
};

describe.each(Object.entries(expectedSources))(
  "%s HIFLD example",
  (storyId, sourceIds) => {
    it("is a 12-chapter story using every approved chapter type", () => {
      const story = storyProjectSchema.parse(findExampleStory(storyId));
      expect(story.chapters).toHaveLength(12);
      expect(new Set(story.chapters.map(({ type }) => type))).toEqual(
        new Set(["prose", "map", "scrolly", "chart", "flyover", "image"]),
      );
      expect(compileProject(story).chapters).toHaveLength(12);
    });

    it("pins connected HIFLD PMTiles and records matching API provenance", () => {
      const story = storyProjectSchema.parse(findExampleStory(storyId));
      for (const sourceId of sourceIds) {
        const source = story.sources.find(({ id }) => id === sourceId);
        expect(source).toMatchObject({
          kind: "pmtiles",
          tileType: "vector",
          delivery: "connected",
        });
        if (!source || source.kind !== "pmtiles") throw new Error(sourceId);
        const match = source.locator.match(
          /^https:\/\/hifld\.publicenvirodata\.org\/storage\/([^/]+)\/\1\/v1\.0\.0\/pmtiles\/\1\.pmtiles$/,
        );
        expect(match).not.toBeNull();
        expect(source.provenance.sourceUrl).toBe(
          `https://hifld.publicenvirodata.org/api/collections/hifld/datasets/${match?.[1]}`,
        );
        expect(source.provenance.accessedAt).toBe("2026-08-17");
      }
    });
  },
);
```

- [ ] **Step 2: Run the tests and verify the feature is absent**

Run: `yarn test apps/local-service/src/hifldExamples.test.ts`

Expected: FAIL because `findExampleStory("earthquakes")` and
`findExampleStory("electric-grid")` return `null`.

- [ ] **Step 3: Commit the red test**

```bash
git add apps/local-service/src/hifldExamples.test.ts
git commit -m "test: specify HIFLD example stories"
```

### Task 2: Add the HIFLD story configurations

**Files:**

- Create: `apps/local-service/src/hifldExamples.ts`
- Modify: `apps/local-service/src/examples.ts`
- Test: `apps/local-service/src/hifldExamples.test.ts`

**Interfaces:**

- Consumes: `StoryProject`, `ProjectSource`, and `createDefaultSourceProvenance` from `@earth-stories/story-schema`.
- Produces: `earthquakeStory: StoryProject` and `electricGridStory: StoryProject`.

- [ ] **Step 1: Add the typed HIFLD source helper**

```ts
type PmtilesSource = Extract<ProjectSource, { kind: "pmtiles" }>;

function hifldSource(options: {
  id: string;
  slug: string;
  label: string;
  attribution: string;
  publisher: string;
  presentation: NonNullable<PmtilesSource["presentation"]>;
  temporalCoverage?: { start: string | null; end: string | null };
  transformations?: string[];
}): PmtilesSource {
  const { slug } = options;
  return {
    id: options.id,
    kind: "pmtiles",
    label: options.label,
    locator: `https://hifld.publicenvirodata.org/storage/${slug}/${slug}/v1.0.0/pmtiles/${slug}.pmtiles`,
    tileType: "vector",
    attribution: options.attribution,
    sizeBytes: null,
    delivery: "connected",
    provenance: {
      ...createDefaultSourceProvenance(),
      publisher: options.publisher,
      sourceUrl: `https://hifld.publicenvirodata.org/api/collections/hifld/datasets/${slug}`,
      accessedAt: "2026-08-17",
      temporalCoverage: options.temporalCoverage ?? null,
      transformations: options.transformations ?? [
        "HIFLD Next conversion to version-pinned vector PMTiles",
      ],
    },
    presentation: options.presentation,
  };
}
```

- [ ] **Step 2: Define `earthquakeStory` from the approved design**

Create `example-earthquakes` with the 11 sources and 12 chapter titles listed
in the design spec. Use global and Pacific Rim cameras for the first five map
chapters, a western United States camera for Quaternary faults, a Pacific camera
for tsunami events/observations, the existing Antakya COG URL for the damage
view, and a final western U.S. multi-hazard overlay. Include the two CSV sources
at `assets/earthquake-history.csv` and
`assets/earthquake-consequences.csv`, and the image source at
`assets/alaska-earthquake-damage.jpg`.

The story copy must state:

```text
The uneven rise in recorded events reflects preservation, reporting, and
instrumentation. This archive cannot tell us that earthquakes are becoming
more frequent.

Faults are evidence of past surface deformation, not a schedule of the next
earthquake.

Nearby records can share a tectonic setting without proving that one event
caused another.
```

- [ ] **Step 3: Define `electricGridStory` from the approved design**

Create `example-electric-grid` with the 11 sources and 12 chapter titles listed
in the design spec. Use national cameras for plants, NERC regions, service
territories, and fueling stations; use a multi-keyframe flyover following a
western-to-eastern transmission corridor; and use a Gulf Coast camera to
compare gas pipelines with power plants. Include the capacity CSV at
`assets/generation-by-fuel.csv` and image at `assets/energy-hardware.png`.

The story copy must state:

```text
Plant count is not capacity, and capacity is not generation.

Mapped lines do not reveal electrical flow, loading, congestion, outages, or
real-time condition.

Responsibility boundaries are not electrical walls, and pipeline proximity
does not prove that a pipe supplies a particular plant.
```

- [ ] **Step 4: Register both stories in the existing catalog**

```ts
import { earthquakeStory, electricGridStory } from "./hifldExamples.js";

const exampleStories = [
  antakya,
  boundaries,
  pointCloud,
  temporalFields,
  richMedia,
  stormTrack,
  earthquakeStory,
  electricGridStory,
];
```

- [ ] **Step 5: Run the focused tests**

Run: `yarn test apps/local-service/src/hifldExamples.test.ts`

Expected: PASS for story shape, compilation, chapter diversity, URL pinning,
and provenance.

- [ ] **Step 6: Commit the story configuration**

```bash
git add apps/local-service/src/examples.ts apps/local-service/src/hifldExamples.ts apps/local-service/src/hifldExamples.test.ts
git commit -m "feat: add HIFLD earthquake and grid examples"
```

### Task 3: Bundle the five real chart and image assets

**Files:**

- Modify: `apps/local-service/src/exampleAssets.ts`
- Create: `apps/local-service/src/example-assets/example-earthquakes/earthquake-history.csv`
- Create: `apps/local-service/src/example-assets/example-earthquakes/earthquake-consequences.csv`
- Create: `apps/local-service/src/example-assets/example-earthquakes/alaska-earthquake-damage.jpg`
- Create: `apps/local-service/src/example-assets/example-electric-grid/generation-by-fuel.csv`
- Create: `apps/local-service/src/example-assets/example-electric-grid/energy-hardware.png`
- Test: `apps/local-service/src/examples.test.ts`

**Interfaces:**

- Consumes: `EXAMPLE_ASSET_FILES` lookup used by `loadExampleAssetFiles`.
- Produces: Five non-empty files copied into editable example projects.

- [ ] **Step 1: Run the existing asset-coverage test and verify it is red**

Run: `yarn test apps/local-service/src/examples.test.ts`

Expected: FAIL because the new included CSV/image sources are not yet mapped or
present.

- [ ] **Step 2: Add the NCEI-derived earthquake CSV snapshots**

`earthquake-history.csv`:

```csv
period,event_count
Before 1500,608
1500–1799,892
1800–1899,1045
1900–1949,1119
1950–1999,1495
2000–2026,1472
```

`earthquake-consequences.csv`:

```csv
event,year,magnitude,reported_deaths
Agadir Morocco,1960,5.9,13100
Valdivia Chile,1960,9.5,2226
Alaska USA,1964,9.2,139
Haiti,2010,7.0,316000
Honshu Japan,2011,9.1,18423
Kahramanmaras Turkey and Syria,2023,7.8,56697
```

- [ ] **Step 3: Add the HIFLD-derived electricity CSV snapshot**

`generation-by-fuel.csv`:

```csv
fuel_family,summer_capacity_mw
Natural gas,393088
Coal,336610
Hydroelectric,99058
Nuclear,92047
Other / unavailable,73432
Wind,36735
Petroleum,31567
Biomass and waste,12490
Solar,5528
Geothermal,2066
```

- [ ] **Step 4: Add the two public-domain USGS originals**

Download the USGS originals and store them under the exact paths above:

```text
https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/thumbnails/image/1964_EQ_slider.jpg
https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/thumbnails/image/Turbines_Photovoltaic-Array_blend2.png
```

Confirm each file reports the expected JPEG or PNG media type and has non-zero
dimensions before adding it to the story.

- [ ] **Step 5: Register all five assets**

```ts
"example-earthquakes": [
  "earthquake-history.csv",
  "earthquake-consequences.csv",
  "alaska-earthquake-damage.jpg",
],
"example-electric-grid": [
  "generation-by-fuel.csv",
  "energy-hardware.png",
],
```

- [ ] **Step 6: Run both example test files**

Run: `yarn test apps/local-service/src/examples.test.ts apps/local-service/src/hifldExamples.test.ts`

Expected: PASS, including non-empty bundled asset coverage and compilation.

- [ ] **Step 7: Commit the bundled assets**

```bash
git add apps/local-service/src/exampleAssets.ts apps/local-service/src/example-assets/example-earthquakes apps/local-service/src/example-assets/example-electric-grid
git commit -m "feat: bundle HIFLD example story assets"
```

### Task 4: Document and verify the expanded example catalog

**Files:**

- Modify: `docs/examples.md`
- Create: `docs/superpowers/specs/2026-08-17-hifld-example-stories-design.md`
- Create: `docs/superpowers/plans/2026-08-17-hifld-example-stories.md`

**Interfaces:**

- Consumes: Final source IDs, chapter counts, and provenance rules.
- Produces: Maintainer-facing documentation for the two new examples and the temporary assumed-API convention.

- [ ] **Step 1: Add both stories to the catalog documentation**

Add two bullets under “The initial catalog contains”:

```markdown
- **The Ground Remembers**, a 12-chapter HIFLD natural-hazards story combining
  significant earthquakes, plate boundaries, faults, volcanoes, tsunamis,
  aerial imagery, charts, and a public-domain photograph;
- **The Grid Between Us**, a 12-chapter HIFLD infrastructure story combining
  plants, generating units, transmission lines, operational territories, gas
  pipelines, fueling stations, a capacity chart, and a public-domain image.
```

Add a short “HIFLD assumed API configuration” section describing the pinned
`v1.0.0` PMTiles path, the catalog outage, the absence of live availability
tests, and the requirement to recheck slugs and versions when ingestion returns.

- [ ] **Step 2: Format the changed text files**

Run: `yarn prettier --write apps/local-service/src/examples.ts apps/local-service/src/hifldExamples.ts apps/local-service/src/hifldExamples.test.ts apps/local-service/src/exampleAssets.ts docs/examples.md docs/superpowers/specs/2026-08-17-hifld-example-stories-design.md docs/superpowers/plans/2026-08-17-hifld-example-stories.md`

Expected: exit 0.

- [ ] **Step 3: Run feature verification**

Run: `yarn test apps/local-service/src/examples.test.ts apps/local-service/src/hifldExamples.test.ts`

Run: `yarn typecheck`

Run: `yarn build`

Expected: all commands exit 0 with no failed tests or TypeScript/build errors.

- [ ] **Step 4: Inspect the feature diff and constraints**

Run: `git diff --check`

Run: `git status --short`

Verify that only the files in this plan and the five intentional assets are
changed, all 24 chapters exist, all 16 HIFLD sources use matching versioned
locators/provenance links, and every limitation statement in the design appears
in story copy.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/examples.md docs/superpowers/specs/2026-08-17-hifld-example-stories-design.md docs/superpowers/plans/2026-08-17-hifld-example-stories.md
git commit -m "docs: explain HIFLD example story assumptions"
```
