import {
  createDefaultSourceProvenance,
  type StoryProject,
  type ProjectSource,
} from "@earth-stories/story-schema";

const iceRecord = "https://zenodo.org/records/22129588";
const forestRecord = "https://doi.org/10.25452/figshare.plus.32288616";
const ecosystemRecord = "https://doi.org/10.5281/zenodo.19448555";
const created = "2026-11-16T00:00:00.000Z";

function story(id: string, title: string, description: string): StoryProject {
  return {
    schema: "earth-stories/project/v2",
    id: `example-${id}`,
    metadata: {
      title,
      description,
      author: null,
      created,
      updated: created,
    },
    basemap: {
      id: "carto-positron",
      label: "CARTO Positron",
      styleUrl: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      attribution: "© OpenStreetMap contributors © CARTO",
    },
    publication: {
      profile: "connected",
      theme: "editorial",
      offlineBasemap: { mode: "neutral" },
    },
    dataAssets: [],
    sources: [],
    chapters: [],
  };
}

function image(
  id: string,
  filename: string,
  label: string,
  sourceUrl: string,
  scientific = false,
): ProjectSource {
  return {
    id,
    kind: "image",
    path: `assets/${filename}`,
    label,
    delivery: "included",
    sizeBytes: null,
    attribution: scientific
      ? "Pyles et al. (2026), Zenodo v4, CC BY 4.0; chart by Earth Stories"
      : "Earth Stories original editorial diagram; not observations",
    provenance: {
      ...createDefaultSourceProvenance(),
      sourceUrl: scientific
        ? sourceUrl
        : "https://github.com/aboydnw/earth-stories",
      accessedAt: "2026-11-16",
      publisher: scientific ? "Pyles et al." : "Earth Stories",
      licenseName: scientific ? "CC BY 4.0" : "MIT",
      licenseUrl: scientific
        ? "https://creativecommons.org/licenses/by/4.0/"
        : "https://github.com/aboydnw/earth-stories/blob/main/LICENSE",
      transformations: scientific
        ? [
            "Select RGI60-07.01464 (Kronebreen) from v4 NetCDF",
            "Plot monthly ablation rates and source uncertainty; retain geometry-gap and interpolation flags; no smoothing",
          ]
        : [
            "Original conceptual illustration, not geospatial data; equal panels do not encode area or probabilities",
          ],
    },
  };
}

export const edgeOfIce = story(
  "edge-of-ice",
  "Edge of Ice",
  "A data-backed reading of Kronebreen's monthly record. Front-map exploration is still in development.",
);
edgeOfIce.sources = [
  {
    ...image(
      "ice-fronts",
      "kronebreen-fronts.png",
      "Kronebreen: 114 monthly glacier fronts",
      iceRecord,
      true,
    ),
    provenance: {
      ...createDefaultSourceProvenance(),
      sourceUrl: iceRecord,
      licenseName: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      publisher: "Pyles et al.",
      accessedAt: "2026-11-16",
      spatialCoverage: "Kronebreen, Svalbard; RGI60-07.01464",
      transformations: [
        "Select 114 available Kronebreen fronts from v4 GeoPackage sval_monthly_termini",
        "Plot native EPSG:32633 coordinates in kilometres, with January 2015 and December 2024 highlighted; do not interpolate missing geometries",
      ],
    },
  },
  image(
    "ice-record",
    "kronebreen-record.png",
    "Kronebreen: monthly rate and coverage",
    iceRecord,
    true,
  ),
  {
    id: "ice-table",
    kind: "csv",
    path: "assets/kronebreen-monthly.csv",
    label: "Kronebreen monthly source values",
    delivery: "included",
    sizeBytes: null,
    attribution: "Pyles et al. (2026), CC BY 4.0",
    provenance: {
      ...createDefaultSourceProvenance(),
      sourceUrl: iceRecord,
      publisher: "Pyles et al.",
      licenseName: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      accessedAt: "2026-11-16",
      spatialCoverage: "Kronebreen, Svalbard; RGI60-07.01464",
      temporalCoverage: { start: "2015-02-01", end: "2024-12-31" },
      transformations: [
        "Subset the named glacier from the v4 NetCDF; preserve source rates, uncertainties, missing-geometry and interpolation flags; no aggregation or smoothing",
      ],
    },
  },
];
edgeOfIce.chapters = [
  {
    id: "edge-opening",
    type: "prose",
    title: "The boundary between glacier and sea",
    narrative:
      "From a distance, a glacier can seem as permanent as the mountains around it. Follow its edge, where ice meets water, and you are following a boundary that moves.\n\nThis story begins at **Kronebreen in Svalbard**. Its monthly record gives us a way to ask what happens at that boundary, without pretending that one line tells the whole story.\n\n**Data edition:** the chart below uses the researchers' v4 observations and estimates. The monthly-front figure is static; a selectable map is not yet included. Use the chapter navigation to move at your own pace.",
  },
  {
    id: "edge-outlines",
    type: "image",
    title: "An edge with a memory",
    sourceId: "ice-fronts",
    alt: "114 available monthly glacier front outlines for Kronebreen, January 2015 through December 2024, plotted in UTM coordinates. January 2015 is gold and December 2024 is white. Missing months have no outline.",
    caption:
      "Model-derived monthly average fronts from Sentinel-1 radar, not daily observations or a reconstruction of individual calving events.",
    narrative:
      "One line shows a boundary. Let the other months gather around it, and the boundary becomes a record. These are the 114 available monthly fronts for Kronebreen in the source GeoPackage. The 6 absent months stay absent.\n\nThe lines mark the ice front, not a coastline or the glacier's complete outline. Their coordinate grid makes this a comparison of position, not a photographic view. A selectable two-date map remains future work.",
  },
  {
    id: "edge-record",
    type: "image",
    title: "A record with visible gaps",
    sourceId: "ice-record",
    alt: "Kronebreen monthly frontal ablation estimates, February 2015 to December 2024, with source uncertainty bars. Amber diamonds identify interpolated area-change intervals; amber ticks identify missing geometry. No line connects the points.",
    caption:
      "Rates are expressed in gigatonnes per year, sampled at monthly intervals. They are not monthly totals. The study's sign convention is retained: negative values indicate mass loss. Source-reported uncertainties are not relabeled as confidence intervals.",
    narrative:
      "One outline shows a place; another gives it a memory. The researchers also estimated the rate of ice loss at the front. Each point here belongs to a monthly interval, and each vertical bar preserves the uncertainty supplied with it.\n\nThe amber points deserve a second look. Their frontal area change bridges gaps in the geometry record. An estimated change is not a newly observed edge.",
  },
  {
    id: "edge-boundary",
    type: "prose",
    title: "A moving edge is not a balance sheet",
    narrative:
      "A glacier can flow toward the sea while its front retreats. Estimating frontal ablation requires more than comparing outlines: the researchers also combine ice movement, thickness and modeled surface mass balance.\n\n**Frontal ablation is not total glacier mass loss.** This chart describes the front, not the glacier's complete mass balance. It cannot tell us how an individual piece of ice broke away or reconstruct a particular day's weather.",
  },
  {
    id: "edge-gaps",
    type: "prose",
    title: "Let the gaps remain visible",
    narrative:
      "Kronebreen's file contains 119 monthly intervals, from February 2015 through December 2024. The geometry and interpolation flags answer different questions: was an outline available, and did the area-change estimate bridge a gap? An interval can have geometry and still use interpolated change.\n\nThe chart keeps those distinctions. It does not draw imagined outlines for missing months or smooth the estimates into continuous motion. The editable project includes the underlying CSV, including both flags.",
  },
  {
    id: "edge-explore",
    type: "prose",
    title: "Follow your own question",
    narrative: `Return to a month that caught your eye. Was its geometry available? Was its change estimated across a gap?\n\nThe planned **Svalbard Front Explorer** will keep those questions beside the map: two-date comparison, a coverage strip, and a separate uncertainty panel. It is not a live feature in this edition.\n\nRead the [dataset and downloadable files](${iceRecord}) or the [published study](https://essd.copernicus.org/articles/18/7319/2026/). Pyles and colleagues' v4 dataset is licensed CC BY 4.0. This edition selects one glacier; it makes no claim that its behavior represents all of Svalbard.`,
  },
];

export const beyondTreeCover = story(
  "beyond-tree-cover",
  "Beyond Tree Cover · editorial prototype",
  "What a green map leaves out. Illustrated narrative draft; no ForTy data layer is connected yet.",
);
beyondTreeCover.sources = [
  image(
    "forest-concept",
    "concept.png",
    "Six categories: conceptual key, not a map",
    forestRecord,
  ),
];
beyondTreeCover.chapters = [
  {
    id: "forest-opening",
    type: "prose",
    title: "What a green map leaves out",
    narrative:
      "Before adding a legend, imagine looking across a wooded landscape. Follow the edge of a clearing, the repeated shapes of trees, the places where canopy gives way to something else. 'Forest' might seem a reasonable place to start.\n\n**Editorial prototype, not a data exploration.** These chapters establish the story and its visual language. No local forest classification or satellite imagery has been loaded, and the illustration is not a measured place.",
  },
  {
    id: "forest-key",
    type: "image",
    title: "The green divides",
    sourceId: "forest-concept",
    alt: "Six equally sized colored panels label the ForTy categories. Their sizes do not represent land area or model scores.",
    caption:
      "Conceptual key only. Equal panels are a layout choice, not a distribution of forest types.",
    narrative:
      "Similar colors from above can hold different histories: forests that regenerated naturally, planted forests, intensively managed plantations, and agricultural landscapes where trees produce crops.\n\nForTy distinguishes six classes for the year 2020. Its distinction between planted and plantation forest uses a rotation-period proxy; management history is not directly visible from space.",
  },
  {
    id: "forest-confidence",
    type: "prose",
    title: "A clear edge can hide a question",
    narrative:
      "A colored boundary can look decisive. But different kinds of tree cover can look remarkably alike. A future view will let you inspect the competing class scores instead of showing only the winning color.\n\nThose scores are **not calibrated probabilities of being correct**. They cannot settle the history of a particular place, establish legal compliance, or tell us whether a forest is healthy. Local records and people who know the land remain part of the evidence.",
  },
  {
    id: "forest-time",
    type: "prose",
    title: "Keep the year in view",
    narrative:
      "This dataset describes **2020**, not the landscape today. A recent photograph beside it could quietly imply a comparison the data cannot support.\n\nBefore this story becomes a mapped case study, it needs a verified regional subset, matching imagery dates, checked nodata handling and a documented local context. Until then, there is no before-and-after claim to make.",
  },
  {
    id: "forest-explore",
    type: "prose",
    title: "What would you ask on the ground?",
    narrative: `The proposed **Forest Lens** companion will reveal imagery and classification over the same area, retain the source year, and expose competing scores when you select a location. It has not been built into this prototype.\n\n[ForTy source data](${forestRecord}) are five-band, 10-metre COGs distributed in UTM archives, under CC BY 4.0. [Producer documentation](https://developers.google.com/earth-engine/datasets/catalog/projects_nature-trace_assets_forest_typology_forest_typology_2020_v1_0_collection) explains classes and limitations. The source scores are stored from 0 to 250; the sixth class is the complement of the other five. A data pipeline must validate those values and nodata before deriving colors.\n\nOur next editorial step is to select a real, independently documented landscape, not manufacture a case study from an attractive color pattern.`,
  },
];

export const aPlaceRewritten = story(
  "a-place-rewritten",
  "A Place, Rewritten · editorial prototype",
  "What changes when a landscape keeps its name? Conceptual narrative; annual ecosystem data are not connected yet.",
);
aPlaceRewritten.sources = [
  image(
    "ecosystem-concept",
    "concept.png",
    "Conceptual parts of a landscape",
    ecosystemRecord,
  ),
];
aPlaceRewritten.chapters = [
  {
    id: "place-opening",
    type: "prose",
    title: "A familiar place",
    narrative:
      "A familiar place can feel permanent. We give it a name, remember its outline, and return expecting to recognize it. What makes it feel like itself?\n\n**Editorial prototype, not a measured local history.** No landscape has been selected and no annual ecosystem values have been imported. This is a readable story treatment for the data experience we want to build.",
  },
  {
    id: "place-composition",
    type: "image",
    title: "One place, many parts",
    sourceId: "ecosystem-concept",
    alt: "Six equal colored panels illustrate possible landscape components. This is not the dataset's complete typology, a map, or measured ecosystem fractions.",
    caption:
      "Original conceptual illustration. Panel sizes and positions do not encode observed fractions or sub-pixel geography.",
    narrative:
      "At the scale of a kilometre, one square can contain more than one ecosystem. A single color can conceal that mixture.\n\nThe intended story will open the square into its measured parts, then return them to the whole landscape. This illustration explains that idea, but it does not substitute invented fractions for data.",
  },
  {
    id: "place-record",
    type: "prose",
    title: "A record through time",
    narrative:
      "The proposed evidence spans **1982 to 2024**. Researchers combined land-cover information, climate regions and landforms to map terrestrial ecosystem functional groups through time.\n\nThe accompanying paper is a **preprint under review**. Its mapped fractions do not measure species abundance or ecological health, and a one-kilometre product cannot establish the history of an individual parcel.",
  },
  {
    id: "place-question",
    type: "prose",
    title: "A change is the beginning of a question",
    narrative:
      "A changing map can tell us where to look more closely. It cannot explain a cause by itself.\n\nTo tell a particular landscape's story, we will need historical imagery, local research and land-use records. Small shifts also need scrutiny: changes in classification or noisy estimates must not become confident claims about what happened on the ground.",
  },
  {
    id: "place-explore",
    type: "prose",
    title: "Choose your own route",
    narrative: `The proposed **Ecosystem Time Machine** will compare two years, inspect cell or regional fractions, and preserve the selected place in shareable views. It is not available in this prototype.\n\nThe [dataset record](${ecosystemRecord}) is CC BY 4.0 and distributes access instructions for Google Earth Engine collections, not downloadable global raster files. A verified regional export is needed before a local-first Earth Stories edition can show these maps.\n\nRead [Du and colleagues' preprint](https://essd.copernicus.org/preprints/essd-2026-791/). Before connecting the data we will validate its class order, fraction scale, missing-data handling and comparable annual coverage. No causal interpretation or local change is claimed in this draft.`,
  },
];

export const earthObservationStories = [
  edgeOfIce,
  beyondTreeCover,
  aPlaceRewritten,
];
