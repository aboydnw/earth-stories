import {
  createDefaultSourceProvenance,
  type StoryProject,
} from "@earth-stories/story-schema";
import { earthquakeStory, electricGridStory } from "./hifldExamples.js";

const created = "2026-08-05T00:00:00.000Z";
const basemap = {
  id: "carto-positron",
  label: "CARTO Positron",
  styleUrl: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  attribution: "© OpenStreetMap contributors © CARTO",
};

export interface ExampleConnection {
  id: string;
  title: string;
  description: string;
  kind:
    "cog" | "pmtiles" | "geoparquet" | "xyz" | "zarr" | "trajectory" | "copc";
  locator: string;
  tileType?: "raster" | "vector";
  attribution: string;
  config?: Record<string, unknown>;
  camera: StoryProject["chapters"][number] extends infer _Chapter
    ? { center: [number, number]; zoom: number; bearing: number; pitch: number }
    : never;
}

export interface ExampleStorySummary {
  id: string;
  title: string;
  description: string;
  chapterCount: number;
  formats: string[];
  authoringConnectivity: "local" | "network-required";
}

export const exampleConnections: ExampleConnection[] = [
  {
    id: "hatay-defne-cog",
    title: "Defne aerial imagery",
    description:
      "Ultra-high-resolution aerial imagery after the 2023 Türkiye earthquakes.",
    kind: "cog",
    locator:
      "https://oin-hotosm-temp.s3.amazonaws.com/63eb7815ca43600005f4d91e/0/63eb7815ca43600005f4d91f.tif",
    attribution: "OpenAerialMap contributors, CC BY 4.0",
    camera: { center: [36.1493, 36.1977], zoom: 16, bearing: 0, pitch: 0 },
  },
  {
    id: "hatay-turinclu-cog",
    title: "Turinclu aerial imagery",
    description:
      "High-resolution aerial imagery of Akdeniz and Armutlu after the 2023 earthquakes.",
    kind: "cog",
    locator:
      "https://oin-hotosm-temp.s3.amazonaws.com/63eb8222ca43600005f4d925/0/63eb8222ca43600005f4d926.tif",
    attribution: "OpenAerialMap contributors, CC BY 4.0",
    camera: { center: [36.12, 36.21], zoom: 14, bearing: 0, pitch: 0 },
  },
  {
    id: "antakya-aerial-cog",
    title: "Antakya aerial imagery",
    description: "A public cloud-optimized GeoTIFF of earthquake imagery.",
    kind: "cog",
    locator:
      "https://oin-hotosm-temp.s3.amazonaws.com/63f21def525f0700077ed4e2/0/63f21def525f0700077ed4e3.tif",
    attribution: "OpenAerialMap / HOT",
    camera: { center: [36.1995, 36.229], zoom: 15, bearing: 0, pitch: 0 },
  },
  {
    id: "countries-pmtiles",
    title: "Country boundaries",
    description: "Global country boundaries packaged as vector PMTiles.",
    kind: "pmtiles",
    locator:
      "https://undpngddlsgeohubdev01.blob.core.windows.net/admin/cgaz/ADM0.pmtiles",
    tileType: "vector",
    attribution: "geoBoundaries CGAZ, CC BY 4.0; hosted by UNDP GeoHub",
    camera: { center: [0, 18], zoom: 1.4, bearing: 0, pitch: 0 },
  },
  {
    id: "regions-pmtiles",
    title: "States and provinces",
    description: "Global first-order administrative boundaries in PMTiles.",
    kind: "pmtiles",
    locator:
      "https://undpngddlsgeohubdev01.blob.core.windows.net/admin/cgaz/ADM1.pmtiles",
    tileType: "vector",
    attribution: "geoBoundaries CGAZ, CC BY 4.0; hosted by UNDP GeoHub",
    camera: { center: [-98, 39], zoom: 4, bearing: 0, pitch: 0 },
  },
  {
    id: "fields-zarr",
    title: "Fields of The World",
    description: "Global field predictions with two temporal slices.",
    kind: "zarr",
    locator:
      "https://data.source.coop/ftw/global-data/predictions/zarr/alpha/global.zarr",
    attribution: "Fields of The World / Source Cooperative",
    config: {
      variable: "variables",
      selection: { band: 1 },
      timeDimension: "time",
      timesteps: [
        { label: "2024", index: 0 },
        { label: "2025", index: 1 },
      ],
      geozarr: {
        dimensions: ["y", "x"],
        transform: [8.98311982e-5, 0, -180, 0, -8.98311982e-5, 83.748345],
        shape: [1566049, 4007517],
        crs: "EPSG:4326",
      },
    },
    camera: { center: [0, 15], zoom: 1.4, bearing: 0, pitch: 0 },
  },
  {
    id: "imerg-precipitation-zarr",
    title: "IMERG Final Precipitation",
    description:
      "Global satellite precipitation estimates in a temporal Zarr store.",
    kind: "zarr",
    locator: "https://data.source.coop/bkr/imerg/gpm_early.zarr",
    attribution: "NASA GPM IMERG / Source Cooperative",
    config: {
      variable: "precipitation",
      selection: {},
      timeDimension: "time",
      timesteps: [
        { label: "2000-07-06 12:00 UTC", index: 9000 },
        { label: "2000-07-06 12:30 UTC", index: 9001 },
        { label: "2000-07-06 13:00 UTC", index: 9002 },
      ],
      geozarr: {
        dimensions: ["latitude", "longitude"],
        transform: [0.1, 0, -180, 0, 0.1, -90],
        shape: [1800, 3600],
        crs: "EPSG:4326",
      },
    },
    camera: { center: [0, 10], zoom: 1.2, bearing: 0, pitch: 0 },
  },
  {
    id: "global-buildings-pmtiles",
    title: "Global building footprints",
    description:
      "Combined Google, Microsoft, and OpenStreetMap building footprints.",
    kind: "pmtiles",
    locator:
      "https://data.source.coop/vida/google-microsoft-osm-open-buildings/pmtiles/goog_msft_osm.pmtiles",
    tileType: "vector",
    attribution: "VIDA / Google / Microsoft / OpenStreetMap",
    camera: { center: [36.82, -1.29], zoom: 12, bearing: 0, pitch: 0 },
  },
  {
    id: "autzen-copc",
    title: "Autzen Stadium lidar",
    description: "A range-readable classified COPC point cloud.",
    kind: "copc",
    locator: "https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz",
    attribution: "Hobu Inc.",
    config: { colorMode: "elevation", pointSize: 2 },
    camera: {
      center: [-123.0687, 44.0582],
      zoom: 15.5,
      bearing: -30,
      pitch: 55,
    },
  },
];

function exampleConnection(id: string): ExampleConnection {
  const connection = exampleConnections.find(
    (candidate) => candidate.id === id,
  );
  if (!connection) throw new Error(`Missing example connection: ${id}`);
  return connection;
}

const antakya: StoryProject = {
  schema: "earth-stories/project/v2",
  id: "example-antakya",
  metadata: {
    title: "Antakya from above",
    description: "A short example of using public aerial imagery in a story.",
    author: "Development Seed",
    created,
    updated: created,
  },
  basemap,
  publication: {
    profile: "connected",
    theme: "cng",
    offlineBasemap: { mode: "neutral" },
  },
  dataAssets: [],
  sources: [
    {
      id: "antakya-cog",
      kind: "cog",
      label: "Antakya aerial imagery",
      locator: exampleConnection("antakya-aerial-cog").locator,
      attribution: exampleConnection("antakya-aerial-cog").attribution,
      sizeBytes: null,
      delivery: "connected",
      provenance: createDefaultSourceProvenance(),
      presentation: {
        opacity: 0.92,
        color: "#cf3f02",
        strokeColor: "#443f3f",
        radius: 6,
        sourceLayer: null,
        rasterBand: 1,
        rescale: null,
        colormap: "viridis",
        colormapReversed: false,
        legendTitle: "Aerial imagery",
        legendVisible: false,
        symbolProperty: null,
        categoryColors: {},
        filterProperty: null,
        filterValue: null,
      },
    },
  ],
  chapters: [
    {
      id: "antakya-opening",
      type: "prose",
      title: "When the ground moved",
      narrative:
        "On 6 February 2023, two major earthquakes eleven hours apart shook southern Türkiye and northern Syria — the first magnitude 7.8, the second 7.5. Antakya, built along a valley on the East Anatolian Fault, absorbed some of the worst damage of any city in the region. Within weeks, volunteer pilots and open-imagery groups were flying drones over the ruins, publishing what they captured with no login and no paywall between the imagery and anyone who needed it.",
    },
    {
      id: "antakya-map",
      type: "scrolly",
      title: "A district seen from above",
      narrative:
        "This chapter reads a **cloud-optimized GeoTIFF** directly from its public OpenAerialMap source — no tile server, no preprocessing step. Pan and zoom to see the block-by-block pattern of collapse against the streets that survived.",
      sourceId: "antakya-cog",
      camera: { center: [36.1995, 36.229], zoom: 15, bearing: 0, pitch: 22 },
    },
    {
      id: "antakya-close",
      type: "scrolly",
      title: "Close enough to see the damage",
      narrative:
        "At full resolution, individual collapsed roofs, cleared rubble, and the access routes bulldozers cut between them all become legible. This is roughly the level of detail search-and-rescue teams and damage assessors worked from in the weeks after the quakes.",
      sourceId: "antakya-cog",
      camera: { center: [36.1995, 36.229], zoom: 18, bearing: 12, pitch: 40 },
    },
    {
      id: "antakya-method",
      type: "prose",
      title: "What a connected COG buys you",
      narrative:
        "A cloud-optimized GeoTIFF stores its own internal index, so a browser can request only the tiles a reader is currently looking at instead of downloading the entire file. Keep this story's delivery **connected** and the imagery stays at its OpenAerialMap source, current and re-checkable; switch it to **portable** and Earth Stories copies the same file into the export instead, trading a live source for a self-contained one.",
    },
    {
      id: "antakya-credits",
      type: "prose",
      title: "How this story was built",
      narrative:
        "Three chapters, one dataset: a single public COG credited to OpenAerialMap contributors under CC BY 4.0. Duplicate this example from the workspace to swap in a different flight, reframe the camera, or add your own reporting alongside it.",
    },
  ],
};

const boundaries: StoryProject = {
  schema: "earth-stories/project/v2",
  id: "example-boundaries",
  metadata: {
    title: "Lines on a shared planet",
    description: "A PMTiles example for styling and scrollytelling.",
    author: "Development Seed",
    created,
    updated: created,
  },
  basemap,
  publication: {
    profile: "connected",
    theme: "editorial",
    offlineBasemap: { mode: "neutral" },
  },
  dataAssets: [],
  sources: [
    {
      id: "countries",
      kind: "pmtiles",
      label: "Country boundaries",
      locator: exampleConnection("countries-pmtiles").locator,
      tileType: "vector",
      attribution: exampleConnection("countries-pmtiles").attribution,
      sizeBytes: null,
      delivery: "connected",
      provenance: createDefaultSourceProvenance(),
      presentation: {
        opacity: 0.82,
        color: "#cf3f02",
        strokeColor: "#443f3f",
        radius: 4,
        sourceLayer: "admin",
        rasterBand: 1,
        rescale: null,
        colormap: "terrain",
        colormapReversed: false,
        legendTitle: "Country boundaries",
        legendVisible: true,
        symbolProperty: null,
        categoryColors: {},
        filterProperty: null,
        filterValue: null,
      },
    },
    {
      id: "tile-pyramid",
      kind: "csv",
      label: "PMTiles archive contents",
      path: "assets/tile-pyramid.csv",
      attribution: "Earth Stories, computed from the archive header",
      sizeBytes: null,
      delivery: "included",
      provenance: createDefaultSourceProvenance(),
    },
    {
      id: "everest-relief",
      kind: "image",
      label: "Everest massif relief",
      path: "assets/everest-relief.png",
      attribution: "Copernicus DEM GLO-30 / ESA, rendered by Earth Stories",
      sizeBytes: null,
      delivery: "included",
      provenance: createDefaultSourceProvenance(),
    },
    {
      id: "everest-elevation",
      kind: "csv",
      label: "Everest massif elevation distribution",
      path: "assets/everest-elevation.csv",
      attribution: "Copernicus DEM GLO-30 / ESA, computed by Earth Stories",
      sizeBytes: null,
      delivery: "included",
      provenance: createDefaultSourceProvenance(),
    },
  ],
  chapters: [
    {
      id: "boundaries-opening",
      type: "prose",
      title: "Lines on a shared planet",
      narrative:
        "Administrative boundaries are useful context, but they are representations rather than physical features — agreements, treaties, and surveys rendered as lines. This example shows how one public PMTiles archive can support several narrative views, then contrasts those human lines against a physical dataset that has no opinion about where one country ends and another begins.",
    },
    {
      id: "boundaries-world",
      type: "scrolly",
      title: "A global index",
      narrative:
        "PMTiles keeps a complete vector tile pyramid in one range-readable file. Earth Stories discovers its source layers and applies the story's presentation settings in both preview and publication.",
      sourceId: "countries",
      camera: { center: [8, 18], zoom: 1.45, bearing: 0, pitch: 0 },
    },
    {
      id: "boundaries-europe",
      type: "scrolly",
      title: "A denser mosaic",
      narrative:
        "Zoom into any region and the same archive holds up: more than forty distinct jurisdictions sit inside an area smaller than the Sahara, each boundary line drawn by a different history.",
      sourceId: "countries",
      camera: { center: [10, 50], zoom: 3, bearing: 0, pitch: 0 },
    },
    {
      id: "boundaries-close",
      type: "map",
      title: "Move closer",
      narrative:
        "Zooming changes the reading of the same source. Adjust the camera, colors, opacity, and legend in the editor, then publish the result as a connected or portable story.",
      sourceId: "countries",
      camera: { center: [21, 5], zoom: 3, bearing: -4, pitch: 18 },
    },
    {
      id: "boundaries-pyramid-chart",
      type: "chart",
      title: "What one file actually stores",
      narrative:
        "This compact admin-0 archive addresses 82 tiles across four zoom levels. PMTiles stores its indexed vector tiles in one range-readable file, so the browser can request only the geographic context needed for the current view.",
      sourceId: "tile-pyramid",
      chartType: "bar",
      xColumn: "metric",
      yColumn: "tile_count",
      xLabel: "Metric",
      yLabel: "Count",
    },
    {
      id: "boundaries-relief-image",
      type: "image",
      title: "What the boundaries don't show",
      narrative:
        'This is the same planet, rendered from a completely different dataset: a digital elevation model of the Everest massif, on the border the boundary lines above call "Nepal / China." No administrative line appears anywhere in this image — only relief, real and indifferent to where the border falls.',
      sourceId: "everest-relief",
      alt: "Hillshaded terrain relief of the Everest massif on the Nepal-China border, derived from Copernicus DEM elevation data.",
      caption:
        "Copernicus DEM GLO-30, Nepal–China border near Mount Everest. Elevation ranges from 188 m to 8,730 m within this single tile.",
    },
    {
      id: "boundaries-elevation-chart",
      type: "chart",
      title: "Where all that height goes",
      narrative:
        "A real elevation histogram of the same tile: most of the surface sits in the 3,000–5,500 meter band of high valleys and ridgelines, with a thin tail reaching toward the summit itself.",
      sourceId: "everest-elevation",
      chartType: "bar",
      xColumn: "elevation_band_m",
      yColumn: "share_percent",
      xLabel: "Elevation band (m)",
      yLabel: "Share of pixels (%)",
    },
    {
      id: "boundaries-credits",
      type: "prose",
      title: "How this story was built",
      narrative:
        "Two kinds of sources sit side by side here: a **connected** PMTiles archive (geoBoundaries CGAZ, CC BY 4.0) that stays at its public URL, and three **included** files — a chart and an image generated directly from a public Copernicus DEM tile (ESA, free and open under the Copernicus license) and range-read PMTiles header statistics computed for this story. Duplicate this example to swap in your own boundary archive or elevation tile.",
    },
  ],
};

const pointCloud: StoryProject = {
  schema: "earth-stories/project/v2",
  id: "example-point-cloud",
  metadata: {
    title: "Anatomy of a point cloud",
    description: "Fly through classified lidar above Autzen Stadium.",
    author: "Development Seed",
    created,
    updated: created,
  },
  basemap,
  publication: {
    profile: "connected",
    theme: "cng",
    offlineBasemap: { mode: "neutral" },
  },
  dataAssets: [],
  sources: [
    {
      id: "autzen",
      kind: "copc",
      label: "Autzen Stadium lidar",
      locator: exampleConnection("autzen-copc").locator,
      colorMode: "elevation",
      pointSize: 2,
      attribution: "Hobu Inc.",
      sizeBytes: null,
      delivery: "connected",
      provenance: createDefaultSourceProvenance(),
      presentation: {
        ...{
          opacity: 0.9,
          color: "#cf3f02",
          strokeColor: "#443f3f",
          radius: 4,
          sourceLayer: null,
          rasterBand: 1,
          rescale: null,
          colormap: "terrain" as const,
          colormapReversed: false,
          legendTitle: "Lidar returns",
          legendVisible: false,
          symbolProperty: null,
          categoryColors: {},
          filterProperty: null,
          filterValue: null,
        },
      },
    },
    {
      id: "autzen-classification",
      kind: "csv",
      label: "Autzen point classification",
      path: "assets/autzen-classification.csv",
      attribution: "Hobu Inc., computed by Earth Stories",
      sizeBytes: null,
      delivery: "included",
      provenance: createDefaultSourceProvenance(),
    },
    {
      id: "autzen-scatter",
      kind: "image",
      label: "Autzen Stadium, straight down",
      path: "assets/autzen-scatter.png",
      attribution: "Hobu Inc., rendered by Earth Stories",
      sizeBytes: null,
      delivery: "included",
      provenance: createDefaultSourceProvenance(),
    },
  ],
  chapters: [
    {
      id: "cloud-intro",
      type: "prose",
      title: "A cloud of points",
      narrative:
        "Lidar records millions of individual measurements in three-dimensional space, each one a laser pulse timed to a returning echo. **COPC** reorganizes those points into an octree so a browser can stream only the detail needed for the current view, instead of downloading every point in the file.",
    },
    {
      id: "cloud-flight",
      type: "flyover",
      title: "Above Autzen Stadium",
      narrative:
        "Scroll to approach from the surrounding campus, circle the stadium bowl, then drop toward the field itself.",
      sourceId: "autzen",
      overlaySourceIds: [],
      scrollLength: 1.6,
      keyframes: [
        {
          center: [-123.078, 44.0605],
          zoom: 12.5,
          bearing: -30,
          pitch: 30,
          caption: "The stadium sits within the wider university campus.",
          terrain: { enabled: true, exaggeration: 1 },
          buildings: false,
          globe: false,
        },
        {
          center: [-123.0687, 44.0582],
          zoom: 14.5,
          bearing: 60,
          pitch: 45,
          caption: "The approach reveals the stadium bowl and nearby fields.",
          terrain: { enabled: true, exaggeration: 1 },
          buildings: false,
          globe: false,
        },
        {
          center: [-123.0687, 44.0582],
          zoom: 16,
          bearing: 150,
          pitch: 58,
          caption: "A higher pitch brings the seating structure into view.",
          terrain: { enabled: true, exaggeration: 1 },
          buildings: false,
          globe: false,
        },
        {
          center: [-123.0687, 44.0578],
          zoom: 17.2,
          bearing: 200,
          pitch: 66,
          caption: "The final view descends toward the field.",
          terrain: { enabled: true, exaggeration: 1 },
          buildings: false,
          globe: false,
        },
      ],
    },
    {
      id: "cloud-classification-chart",
      type: "chart",
      title: "What's actually in the file",
      narrative:
        "Every point in a classified lidar survey is labeled with what it bounced off. Sampled across the archive, three-fifths of Autzen's returns are bare **ground**, a quarter are **high vegetation** — trees taller than about two meters — and the rest split between water, buildings, and points the classifier left unassigned.",
      sourceId: "autzen-classification",
      chartType: "bar",
      xColumn: "classification",
      yColumn: "share_percent",
      xLabel: "Classification",
      yLabel: "Share of sampled points (%)",
    },
    {
      id: "cloud-scatter-image",
      type: "image",
      title: "The stadium from directly above",
      narrative:
        "A decimated top-down render of the same survey, colored by elevation: the stadium bowl reads as a bright ring around a darker field, with the surrounding parking lots, buildings, and a creek visible in the same frame.",
      sourceId: "autzen-scatter",
      alt: "Top-down scatter plot of classified lidar points around Autzen Stadium, colored by elevation from dark purple to bright yellow.",
      caption: "1.8 million sampled returns, colored by elevation (406–613 m).",
    },
    {
      id: "cloud-credits",
      type: "prose",
      title: "How this story was built",
      narrative:
        "One connected COPC point cloud, credited to Hobu Inc., streamed directly by byte range — no server-side conversion. The chart and image beside it were computed from the same file using the same `copc` library the viewer uses to stream it. Duplicate this example to fly a different survey.",
    },
  ],
};

const temporalFields: StoryProject = {
  schema: "earth-stories/project/v2",
  id: "example-temporal-fields",
  metadata: {
    title: "Fields through time",
    description: "A temporal GeoZarr story using global field predictions.",
    author: "Development Seed",
    created,
    updated: created,
  },
  basemap,
  publication: {
    profile: "connected",
    theme: "cng",
    offlineBasemap: { mode: "neutral" },
  },
  dataAssets: [],
  sources: [
    {
      id: "fields",
      kind: "zarr",
      label: "Global field predictions",
      locator: exampleConnection("fields-zarr").locator,
      variable: "variables",
      selection: { band: 1 },
      timeDimension: "time",
      timesteps: [
        { label: "2024", index: 0 },
        { label: "2025", index: 1 },
      ],
      geozarr: {
        dimensions: ["y", "x"],
        transform: [8.98311982e-5, 0, -180, 0, -8.98311982e-5, 83.748345],
        shape: [1566049, 4007517],
        crs: "EPSG:4326",
      },
      attribution: "Fields of The World / Source Cooperative",
      sizeBytes: null,
      delivery: "connected",
      provenance: createDefaultSourceProvenance(),
      presentation: {
        opacity: 0.82,
        color: "#cf3f02",
        strokeColor: "#443f3f",
        radius: 4,
        sourceLayer: null,
        rasterBand: 1,
        rescale: [0, 1],
        colormap: "terrain",
        colormapReversed: false,
        legendTitle: "Field prediction",
        legendVisible: true,
        symbolProperty: null,
        categoryColors: {},
        filterProperty: null,
        filterValue: null,
      },
    },
    {
      id: "fields-iowa",
      kind: "image",
      label: "Iowa cropland, at prediction resolution",
      path: "assets/fields-iowa.png",
      attribution:
        "Fields of The World / Source Cooperative, rendered by Earth Stories",
      sizeBytes: null,
      delivery: "included",
      provenance: createDefaultSourceProvenance(),
    },
    {
      id: "fields-probability",
      kind: "csv",
      label: "Iowa field-prediction confidence",
      path: "assets/fields-probability.csv",
      attribution:
        "Fields of The World / Source Cooperative, computed by Earth Stories",
      sizeBytes: null,
      delivery: "included",
      provenance: createDefaultSourceProvenance(),
    },
  ],
  chapters: [
    {
      id: "fields-intro",
      type: "prose",
      title: "Fields at planetary scale",
      narrative:
        "Fields of The World predicts where agricultural field boundaries fall, everywhere on Earth, from satellite imagery alone — no farm-by-farm survey required. This connected **Zarr** store stays at its public source while Earth Stories reads only the spatial chunks a reader is currently looking at.",
    },
    {
      id: "fields-map",
      type: "map",
      title: "Compare 2024 and 2025",
      narrative:
        "Use the time control to move between the two prediction slices. Zoomed out this far, individual fields dissolve into broad patterns of where cropland is dense and where it barely exists.",
      sourceId: "fields",
      camera: { center: [0, 15], zoom: 1.5, bearing: 0, pitch: 0, globe: true },
    },
    {
      id: "fields-iowa-scroll",
      type: "scrolly",
      title: "Iowa, block by block",
      narrative:
        "Zoom into central Iowa and the prediction sharpens into something almost legible on its own: a faint grid of section-line roads, the branching drainage of creeks and rivers, and a dark, low-confidence patch where Des Moines sits.",
      sourceId: "fields",
      camera: {
        center: [-94.5, 42],
        zoom: 8.3,
        bearing: 0,
        pitch: 0,
      },
      temporalPosition: 1,
    },
    {
      id: "fields-iowa-image",
      type: "image",
      title: "What a confident prediction looks like",
      narrative:
        "The same region, rendered directly from the array: brighter yellow-green marks pixels the model scores as more likely to be field, fading toward the basemap wherever the confidence drops toward zero.",
      sourceId: "fields-iowa",
      alt: "Field-boundary prediction confidence over central Iowa, rendered in a yellow-green colormap with a visible section-line road grid.",
      caption:
        "Central Iowa, 2025 prediction. Mean confidence in this window: 0.70.",
    },
    {
      id: "fields-probability-chart",
      type: "chart",
      title: "How confident is confident",
      narrative:
        'Across this same window, 85% of pixels score above 0.1 — this is genuinely dense cropland, not noise. Real farmland produces a lopsided distribution: little middle ground between "almost certainly field" and "almost certainly not."',
      sourceId: "fields-probability",
      chartType: "bar",
      xColumn: "probability_band",
      yColumn: "share_percent",
      xLabel: "Predicted probability",
      yLabel: "Share of pixels (%)",
    },
    {
      id: "fields-credits",
      type: "prose",
      title: "How this story was built",
      narrative:
        "One connected Zarr store, credited to Fields of The World / Source Cooperative, streamed as chunked arrays at whatever resolution the current zoom level needs. The image and chart beside it were read from the same store's finer pyramid levels over a fixed window in Iowa. Duplicate this example to point at a different variable or region.",
    },
  ],
};

const richMedia: StoryProject = {
  schema: "earth-stories/project/v2",
  id: "example-rich-media",
  metadata: {
    title: "A story beyond the map",
    description: "Video and map overlays in one portable narrative structure.",
    author: "Development Seed",
    created,
    updated: created,
  },
  basemap,
  publication: {
    profile: "connected",
    theme: "editorial",
    offlineBasemap: { mode: "neutral" },
  },
  dataAssets: [],
  sources: [
    ...boundaries.sources.filter((source) => source.kind === "pmtiles"),
    {
      id: "regions",
      kind: "pmtiles",
      label: "States and provinces",
      locator: exampleConnection("regions-pmtiles").locator,
      tileType: "vector",
      attribution: exampleConnection("regions-pmtiles").attribution,
      sizeBytes: null,
      delivery: "connected",
      provenance: createDefaultSourceProvenance(),
      presentation: {
        opacity: 0.72,
        color: "#f0a93b",
        strokeColor: "#443f3f",
        radius: 4,
        sourceLayer: "admin",
        rasterBand: 1,
        rescale: null,
        colormap: "terrain",
        colormapReversed: false,
        legendTitle: "States and provinces",
        legendVisible: true,
        symbolProperty: null,
        categoryColors: {},
        filterProperty: null,
        filterValue: null,
      },
    },
  ],
  chapters: [
    {
      id: "media-video",
      type: "video",
      title: "Start with the wider context",
      narrative:
        "Video chapters keep their original source link in archival exports.",
      provider: "youtube",
      videoId: "4E6yQLoGO2o",
      originalUrl: "https://www.youtube.com/watch?v=4E6yQLoGO2o",
    },
    {
      id: "media-overlay",
      type: "scrolly",
      title: "Two boundary levels",
      narrative:
        "A chapter can combine a primary map source with ordered overlays — here, national borders drawn beneath first-order administrative lines, both from the same public PMTiles catalog.",
      sourceId: "countries",
      overlaySourceIds: ["regions"],
      transition: "fly-to",
      overlayPosition: "left",
      camera: {
        center: [-98, 39],
        zoom: 4,
        bearing: 0,
        pitch: 18,
        buildings: false,
        globe: false,
      },
    },
    {
      id: "media-credits",
      type: "prose",
      title: "How this story was built",
      narrative:
        "One embedded video and two connected PMTiles archives, layered as a primary source and an overlay. Nothing here required a portable copy of the video — the original link travels with the story into every export.",
    },
  ],
};

const stormTrack: StoryProject = {
  schema: "earth-stories/project/v2",
  id: "example-storm-track",
  metadata: {
    title: "Tracking a hurricane",
    description:
      "Best-track fixes turn one of the most studied Atlantic hurricanes into an animated path.",
    author: "Development Seed",
    created,
    updated: created,
  },
  basemap,
  publication: {
    profile: "connected",
    theme: "editorial",
    offlineBasemap: { mode: "neutral" },
  },
  dataAssets: [],
  sources: [
    {
      id: "regions",
      kind: "pmtiles",
      label: "States and provinces",
      locator: exampleConnection("regions-pmtiles").locator,
      tileType: "vector",
      attribution: exampleConnection("regions-pmtiles").attribution,
      sizeBytes: null,
      delivery: "connected",
      provenance: createDefaultSourceProvenance(),
      presentation: {
        opacity: 0.55,
        color: "#7a8a99",
        strokeColor: "#443f3f",
        radius: 4,
        sourceLayer: "admin",
        rasterBand: 1,
        rescale: null,
        colormap: "terrain",
        colormapReversed: false,
        legendTitle: "State boundaries",
        legendVisible: false,
        symbolProperty: null,
        categoryColors: {},
        filterProperty: null,
        filterValue: null,
      },
    },
    {
      id: "katrina-track",
      kind: "trajectory",
      label: "Hurricane Katrina, 2005 best track",
      locator: "assets/katrina-track.json",
      trailLength: 129600,
      attribution: "NOAA National Hurricane Center, HURDAT2",
      sizeBytes: null,
      delivery: "included",
      provenance: createDefaultSourceProvenance(),
      presentation: {
        opacity: 0.95,
        color: "#d1274a",
        strokeColor: "#443f3f",
        radius: 6,
        sourceLayer: null,
        rasterBand: 1,
        rescale: null,
        colormap: "magma",
        colormapReversed: false,
        legendTitle: "Storm track",
        legendVisible: true,
        symbolProperty: null,
        categoryColors: {},
        filterProperty: null,
        filterValue: null,
      },
    },
    {
      id: "katrina-intensity",
      kind: "csv",
      label: "Hurricane Katrina, wind and pressure",
      path: "assets/katrina-intensity.csv",
      attribution: "NOAA National Hurricane Center, HURDAT2",
      sizeBytes: null,
      delivery: "included",
      provenance: createDefaultSourceProvenance(),
    },
  ],
  chapters: [
    {
      id: "storm-opening",
      type: "prose",
      title: "A storm finds its shape",
      narrative:
        "On 23 August 2005, a tropical depression organized over the southeastern Bahamas. Over the next eight days it would cross Florida, explode into a Category 5 hurricane over the Gulf of Mexico, and make landfall on the Louisiana coast — becoming one of the most destructive storms in United States history. Every position in this story comes from NOAA's **best track** for the storm: a reconstruction built after the fact from aircraft reconnaissance, satellite imagery, and surface observations, at regular six-hour intervals with extra fixes inserted at each landfall and at peak intensity.",
    },
    {
      id: "storm-formation",
      type: "scrolly",
      title: "Formation over the Bahamas",
      narrative:
        "The storm's first fixes place it as a weak tropical depression drifting northwest — unremarkable, one of dozens that form and dissipate each Atlantic season without ever making landfall.",
      sourceId: "katrina-track",
      overlaySourceIds: ["regions"],
      camera: { center: [-75.6, 24.2], zoom: 5, bearing: 0, pitch: 0 },
      temporalPosition: 0.06,
    },
    {
      id: "storm-florida",
      type: "scrolly",
      title: "First landfall: South Florida",
      narrative:
        "At 22:30 UTC on 25 August, the storm — now Hurricane Katrina — came ashore near the Miami-Dade/Broward county line as a Category 1 hurricane, sustained winds near 70 knots. It crossed the narrow peninsula within hours and re-emerged over the Gulf of Mexico by the next morning, barely weakened.",
      sourceId: "katrina-track",
      overlaySourceIds: ["regions"],
      camera: { center: [-80.15, 26.05], zoom: 5, bearing: 0, pitch: 0 },
      temporalPosition: 0.292,
    },
    {
      id: "storm-peak",
      type: "scrolly",
      title: "Rapid intensification over the Gulf",
      narrative:
        "Over the Gulf's warm loop current, the storm intensified faster than almost any Atlantic hurricane on record. By 18:00 UTC on 28 August it reached Category 5 strength: sustained winds near 150 knots and a central pressure of 902 millibars, at the time the fourth-lowest ever measured in the Atlantic basin.",
      sourceId: "katrina-track",
      overlaySourceIds: ["regions"],
      camera: { center: [-87.5, 26.5], zoom: 5, bearing: 0, pitch: 0 },
      temporalPosition: 0.667,
    },
    {
      id: "storm-louisiana",
      type: "scrolly",
      title: "Second landfall: the Louisiana coast",
      narrative:
        "Weakening slightly before landfall, the storm came ashore near Buras-Triumph, Louisiana at 11:10 UTC on 29 August as a Category 3 hurricane, then made a third landfall near the Louisiana–Mississippi border three and a half hours later. Storm surge overwhelmed levees protecting New Orleans, flooding most of the city and beginning the deadliest and most costly phase of the disaster.",
      sourceId: "katrina-track",
      overlaySourceIds: ["regions"],
      camera: { center: [-89.6, 29.6], zoom: 5, bearing: 0, pitch: 0 },
      temporalPosition: 0.762,
    },
    {
      id: "storm-intensity-chart",
      type: "chart",
      title: "Wind speed, fix by fix",
      narrative:
        "The same best-track fixes, plotted as sustained wind speed instead of position: the Gulf crossing shows up as a sharp climb and an almost-as-sharp fall, the signature of a storm intensifying over open water and weakening the moment it meets land.",
      sourceId: "katrina-intensity",
      chartType: "line",
      xColumn: "time",
      yColumn: "wind_kt",
      xLabel: "Time (UTC)",
      yLabel: "Sustained wind (knots)",
    },
    {
      id: "storm-credits",
      type: "prose",
      title: "How this story was built",
      narrative:
        "The track and intensity data are drawn directly from NOAA's public-domain HURDAT2 database — 34 best-track fixes, most six hours apart with a few extra ones at each landfall and at peak intensity, unmodified except for the coordinate and timestamp conversion needed to match this story's format. The animated path uses Earth Stories' **trajectory** source kind, which pairs a sequence of positions with a matching sequence of timestamps so the map can interpolate a moving point between them. Duplicate this example to trace a different storm from the same public archive.",
    },
  ],
};

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

export function exampleCatalog(): {
  stories: ExampleStorySummary[];
  connections: ExampleConnection[];
} {
  return {
    stories: exampleStories.map((story) => ({
      id: story.id.replace(/^example-/, ""),
      title: story.metadata.title,
      description: story.metadata.description,
      chapterCount: story.chapters.length,
      formats: [...new Set(story.sources.map((source) => source.kind))],
      authoringConnectivity:
        /^https?:\/\//i.test(story.basemap.styleUrl) ||
        story.sources.some(
          (source) =>
            "locator" in source && /^https?:\/\//i.test(source.locator),
        ) ||
        story.chapters.some((chapter) => chapter.type === "video")
          ? "network-required"
          : "local",
    })),
    connections: exampleConnections,
  };
}

export function findExampleStory(id: string): StoryProject | null {
  return exampleStories.find((story) => story.id === `example-${id}`) ?? null;
}
