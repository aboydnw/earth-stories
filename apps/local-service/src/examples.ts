import type { StoryProject } from "@earth-stories/story-schema";

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
}

export const exampleConnections: ExampleConnection[] = [
  {
    id: "antakya-aerial-cog",
    title: "Antakya aerial imagery",
    description: "A public cloud-optimized GeoTIFF of earthquake imagery.",
    kind: "cog",
    locator:
      "https://oin-hotosm-temp.s3.amazonaws.com/63f21def525f0700077ed4e2/0/63f21def525f0700077ed4e3.tif",
    attribution: "OpenAerialMap / HOT",
    camera: { center: [36.155, 36.205], zoom: 13, bearing: 0, pitch: 0 },
  },
  {
    id: "countries-pmtiles",
    title: "Country boundaries",
    description: "Global country boundaries packaged as vector PMTiles.",
    kind: "pmtiles",
    locator:
      "https://pub-a8e1027739334149a1dadd24c89b6969.r2.dev/context/admin0.pmtiles",
    tileType: "vector",
    attribution: "geoBoundaries CGAZ, CC BY 4.0",
    camera: { center: [0, 18], zoom: 1.4, bearing: 0, pitch: 0 },
  },
  {
    id: "regions-pmtiles",
    title: "States and provinces",
    description: "Global first-order administrative boundaries in PMTiles.",
    kind: "pmtiles",
    locator:
      "https://pub-a8e1027739334149a1dadd24c89b6969.r2.dev/context/admin1.pmtiles",
    tileType: "vector",
    attribution: "geoBoundaries CGAZ, CC BY 4.0",
    camera: { center: [-98, 39], zoom: 2.8, bearing: 0, pitch: 0 },
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

const antakya: StoryProject = {
  schema: "earth-stories/project/v1",
  id: "example-antakya",
  metadata: {
    title: "Antakya from above",
    description: "A short example of using public aerial imagery in a story.",
    author: "Development Seed",
    created,
    updated: created,
  },
  basemap,
  publication: { profile: "connected", theme: "cng" },
  sources: [
    {
      id: "antakya-cog",
      kind: "cog",
      label: "Antakya aerial imagery",
      locator: exampleConnections[0]!.locator,
      attribution: exampleConnections[0]!.attribution,
      sizeBytes: null,
      delivery: "connected",
      presentation: {
        opacity: 0.92,
        color: "#cf3f02",
        strokeColor: "#443f3f",
        radius: 6,
        sourceLayer: null,
        rasterBand: 1,
        rescale: null,
        colormap: "viridis",
        legendTitle: "Aerial imagery",
        legendVisible: false,
      },
    },
  ],
  chapters: [
    {
      id: "antakya-opening",
      type: "prose",
      title: "When the ground moved",
      narrative:
        "On 6 February 2023, powerful earthquakes struck southern Türkiye and northern Syria. Open aerial imagery helps document the scale of change while keeping the source available for independent analysis.",
    },
    {
      id: "antakya-map",
      type: "scrolly",
      title: "A district seen from above",
      narrative:
        "This chapter reads the cloud-optimized GeoTIFF directly from its public source. Pan and zoom to inspect the captured landscape without a tile server.",
      sourceId: "antakya-cog",
      camera: { center: [36.155, 36.205], zoom: 14, bearing: 0, pitch: 22 },
    },
    {
      id: "antakya-method",
      type: "prose",
      title: "A connected publication",
      narrative:
        "The story stays small because the imagery remains connected. A portable release can instead include the COG, while the publication report records the resulting hosting requirements.",
    },
  ],
};

const boundaries: StoryProject = {
  schema: "earth-stories/project/v1",
  id: "example-boundaries",
  metadata: {
    title: "Lines on a shared planet",
    description: "A PMTiles example for styling and scrollytelling.",
    author: "Development Seed",
    created,
    updated: created,
  },
  basemap,
  publication: { profile: "connected", theme: "editorial" },
  sources: [
    {
      id: "countries",
      kind: "pmtiles",
      label: "Country boundaries",
      locator: exampleConnections[1]!.locator,
      tileType: "vector",
      attribution: exampleConnections[1]!.attribution,
      sizeBytes: null,
      delivery: "connected",
      presentation: {
        opacity: 0.82,
        color: "#cf3f02",
        strokeColor: "#443f3f",
        radius: 4,
        sourceLayer: null,
        rasterBand: 1,
        rescale: null,
        colormap: "terrain",
        legendTitle: "Country boundaries",
        legendVisible: true,
      },
    },
  ],
  chapters: [
    {
      id: "boundaries-opening",
      type: "prose",
      title: "Lines on a shared planet",
      narrative:
        "Administrative boundaries are useful context, but they are representations rather than physical features. This example shows how one public PMTiles archive can support several narrative views.",
    },
    {
      id: "boundaries-world",
      type: "scrolly",
      title: "A global index",
      narrative:
        "PMTiles keeps a complete vector tile pyramid in one range-readable file. Earth Stories discovers its source layers and applies the story’s presentation settings in both preview and publication.",
      sourceId: "countries",
      camera: { center: [8, 18], zoom: 1.45, bearing: 0, pitch: 0 },
    },
    {
      id: "boundaries-close",
      type: "map",
      title: "Move closer",
      narrative:
        "Zooming changes the reading of the same source. Adjust the camera, colors, opacity, and legend in the editor, then publish the result as a connected or portable story.",
      sourceId: "countries",
      camera: { center: [21, 5], zoom: 3.2, bearing: -4, pitch: 18 },
    },
  ],
};

const pointCloud: StoryProject = {
  schema: "earth-stories/project/v1",
  id: "example-point-cloud",
  metadata: {
    title: "Anatomy of a point cloud",
    description: "Fly through classified lidar above Autzen Stadium.",
    author: "Development Seed",
    created,
    updated: created,
  },
  basemap,
  publication: { profile: "connected", theme: "cng" },
  sources: [
    {
      id: "autzen",
      kind: "copc",
      label: "Autzen Stadium lidar",
      locator: exampleConnections[4]!.locator,
      colorMode: "elevation",
      pointSize: 2,
      attribution: "Hobu Inc.",
      sizeBytes: null,
      delivery: "connected",
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
          legendTitle: "Lidar returns",
          legendVisible: false,
        },
      },
    },
  ],
  chapters: [
    {
      id: "cloud-intro",
      type: "prose",
      title: "A cloud of points",
      narrative:
        "Lidar records millions of individual measurements in three-dimensional space. COPC reorganizes them so a browser can stream only the detail needed for the current view.",
    },
    {
      id: "cloud-flight",
      type: "flyover",
      title: "Above Autzen Stadium",
      narrative:
        "Scroll to fly from the surrounding landscape into the stadium bowl.",
      sourceId: "autzen",
      overlaySourceIds: [],
      scrollLength: 1.2,
      keyframes: [
        {
          center: [-123.0687, 44.0582],
          zoom: 13.5,
          bearing: -30,
          pitch: 35,
          terrain: { enabled: true, exaggeration: 1 },
          buildings: false,
          globe: false,
        },
        {
          center: [-123.0687, 44.0582],
          zoom: 16,
          bearing: 40,
          pitch: 62,
          terrain: { enabled: true, exaggeration: 1 },
          buildings: false,
          globe: false,
        },
      ],
    },
  ],
};

const temporalFields: StoryProject = {
  schema: "earth-stories/project/v1",
  id: "example-temporal-fields",
  metadata: {
    title: "Fields through time",
    description: "A temporal GeoZarr story using global field predictions.",
    author: "Development Seed",
    created,
    updated: created,
  },
  basemap,
  publication: { profile: "connected", theme: "cng" },
  sources: [
    {
      id: "fields",
      kind: "zarr",
      label: "Global field predictions",
      locator: exampleConnections[3]!.locator,
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
      presentation: {
        opacity: 0.82,
        color: "#cf3f02",
        strokeColor: "#443f3f",
        radius: 4,
        sourceLayer: null,
        rasterBand: 1,
        rescale: [0, 1],
        colormap: "terrain",
        legendTitle: "Field prediction",
        legendVisible: true,
      },
    },
  ],
  chapters: [
    {
      id: "fields-intro",
      type: "prose",
      title: "Fields at planetary scale",
      narrative:
        "This connected Zarr store stays at its public source while Earth Stories reads its spatial chunks directly.",
    },
    {
      id: "fields-map",
      type: "map",
      title: "Compare 2024 and 2025",
      narrative:
        "Use the time control to move between the two prediction slices.",
      sourceId: "fields",
      camera: { center: [0, 15], zoom: 1.5, bearing: 0, pitch: 0, globe: true },
    },
  ],
};

const richMedia: StoryProject = {
  schema: "earth-stories/project/v1",
  id: "example-rich-media",
  metadata: {
    title: "A story beyond the map",
    description: "Video and map overlays in one portable narrative structure.",
    author: "Development Seed",
    created,
    updated: created,
  },
  basemap,
  publication: { profile: "connected", theme: "editorial" },
  sources: [
    ...boundaries.sources,
    {
      id: "regions",
      kind: "pmtiles",
      label: "States and provinces",
      locator: exampleConnections[2]!.locator,
      tileType: "vector",
      attribution: exampleConnections[2]!.attribution,
      sizeBytes: null,
      delivery: "connected",
      presentation: {
        opacity: 0.72,
        color: "#f0a93b",
        strokeColor: "#443f3f",
        radius: 4,
        sourceLayer: null,
        rasterBand: 1,
        rescale: null,
        colormap: "terrain",
        legendTitle: "States and provinces",
        legendVisible: true,
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
      videoId: "v6QMEf5p4qM",
      originalUrl: "https://www.youtube.com/watch?v=v6QMEf5p4qM",
    },
    {
      id: "media-overlay",
      type: "scrolly",
      title: "Two boundary levels",
      narrative:
        "A chapter can combine a primary map source with ordered overlays.",
      sourceId: "countries",
      overlaySourceIds: ["regions"],
      transition: "fly-to",
      overlayPosition: "left",
      camera: {
        center: [-98, 39],
        zoom: 3,
        bearing: 0,
        pitch: 18,
        buildings: false,
        globe: false,
      },
    },
  ],
};

const exampleStories = [
  antakya,
  boundaries,
  pointCloud,
  temporalFields,
  richMedia,
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
    })),
    connections: exampleConnections,
  };
}

export function findExampleStory(id: string): StoryProject | null {
  return exampleStories.find((story) => story.id === `example-${id}`) ?? null;
}
