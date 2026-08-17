import {
  createDefaultSourceProvenance,
  type ProjectSource,
  type StoryProject,
} from "@earth-stories/story-schema";

const created = "2026-08-17T00:00:00.000Z";
const accessedAt = "2026-08-17";
const hifldBaseUrl = "https://hifld.publicenvirodata.org";

const basemap = {
  id: "carto-positron",
  label: "CARTO Positron",
  styleUrl: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  attribution: "© OpenStreetMap contributors © CARTO",
};

type PmtilesSource = Extract<ProjectSource, { kind: "pmtiles" }>;
type Presentation = NonNullable<ProjectSource["presentation"]>;

function presentation(overrides: Partial<Presentation> = {}): Presentation {
  return {
    opacity: 0.82,
    color: "#cf3f02",
    strokeColor: "#443f3f",
    radius: 5,
    sourceLayer: null,
    rasterBand: 1,
    rescale: null,
    colormap: "viridis",
    legendTitle: "",
    legendVisible: true,
    symbolProperty: null,
    categoryColors: {},
    filterProperty: null,
    filterValue: null,
    ...overrides,
  };
}

function hifldSource(options: {
  id: string;
  slug: string;
  label: string;
  attribution: string;
  publisher: string;
  spatialCoverage: string;
  presentation: Presentation;
  temporalCoverage?: { start: string | null; end: string | null };
  transformations?: string[];
}): PmtilesSource {
  const { slug } = options;
  return {
    id: options.id,
    kind: "pmtiles",
    label: options.label,
    locator: `${hifldBaseUrl}/storage/${slug}/${slug}/v1.0.0/pmtiles/${slug}.pmtiles`,
    tileType: "vector",
    attribution: options.attribution,
    sizeBytes: null,
    delivery: "connected",
    provenance: {
      ...createDefaultSourceProvenance(),
      publisher: options.publisher,
      sourceUrl: `${hifldBaseUrl}/api/collections/hifld/datasets/${slug}`,
      accessedAt,
      temporalCoverage: options.temporalCoverage ?? null,
      spatialCoverage: options.spatialCoverage,
      transformations: options.transformations ?? [
        "HIFLD Next conversion to version-pinned vector PMTiles",
      ],
    },
    presentation: options.presentation,
  };
}

export const earthquakeStory: StoryProject = {
  schema: "earth-stories/project/v2",
  id: "example-earthquakes",
  metadata: {
    title: "The Ground Remembers",
    description:
      "Follow earthquakes through the records, boundaries, faults, tsunamis, and landscapes that give them meaning.",
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
    hifldSource({
      id: "significant-earthquakes",
      slug: "historical-significant-earthquake-locations",
      label: "Historical significant earthquakes",
      attribution: "NOAA NCEI / HIFLD Next",
      publisher: "NOAA National Centers for Environmental Information",
      spatialCoverage: "Global",
      temporalCoverage: { start: null, end: accessedAt },
      presentation: presentation({
        color: "#e5484d",
        radius: 4,
        legendTitle: "Significant earthquakes",
      }),
    }),
    hifldSource({
      id: "plate-boundaries",
      slug: "plate-boundaries",
      label: "Tectonic plate boundaries",
      attribution: "U.S. Geological Survey / HIFLD Next",
      publisher: "U.S. Geological Survey",
      spatialCoverage: "Global",
      presentation: presentation({
        opacity: 0.9,
        color: "#f2b134",
        strokeColor: "#b56b16",
        legendTitle: "Plate boundaries",
      }),
    }),
    hifldSource({
      id: "holocene-volcanoes",
      slug: "historical-holocene-volcano-locations",
      label: "Historical Holocene volcanoes",
      attribution: "Smithsonian Institution / HIFLD Next",
      publisher: "Smithsonian Global Volcanism Program",
      spatialCoverage: "Global",
      presentation: presentation({
        color: "#813772",
        radius: 4,
        legendTitle: "Holocene volcanoes",
      }),
    }),
    hifldSource({
      id: "quaternary-faults",
      slug: "quaternary-fault-lines",
      label: "Quaternary faults and folds",
      attribution: "U.S. Geological Survey / HIFLD Next",
      publisher: "U.S. Geological Survey Earthquake Hazards Program",
      spatialCoverage: "United States",
      presentation: presentation({
        opacity: 0.9,
        color: "#d97706",
        strokeColor: "#d97706",
        legendTitle: "Quaternary faults",
      }),
    }),
    hifldSource({
      id: "tsunami-events",
      slug: "historical-tsunami-event-locations",
      label: "Historical tsunami sources",
      attribution: "NOAA NCEI / HIFLD Next",
      publisher: "NOAA National Centers for Environmental Information",
      spatialCoverage: "Global",
      temporalCoverage: { start: null, end: accessedAt },
      presentation: presentation({
        color: "#147d92",
        radius: 5,
        legendTitle: "Tsunami source events",
      }),
    }),
    hifldSource({
      id: "tsunami-observations",
      slug: "historical-tsunami-observations",
      label: "Historical tsunami observations",
      attribution: "NOAA NCEI / HIFLD Next",
      publisher: "NOAA National Centers for Environmental Information",
      spatialCoverage: "Global",
      temporalCoverage: { start: null, end: accessedAt },
      presentation: presentation({
        opacity: 0.72,
        color: "#3e63dd",
        radius: 3,
        legendTitle: "Tsunami observations",
      }),
    }),
    hifldSource({
      id: "significant-volcanic-events",
      slug: "historical-significant-volcanic-event-locations",
      label: "Historical significant volcanic events",
      attribution: "NOAA NCEI / HIFLD Next",
      publisher: "NOAA National Centers for Environmental Information",
      spatialCoverage: "Global",
      temporalCoverage: { start: null, end: accessedAt },
      presentation: presentation({
        color: "#8e4ec6",
        radius: 6,
        legendTitle: "Significant volcanic events",
      }),
    }),
    {
      id: "antakya-aerial",
      kind: "cog",
      label: "Antakya post-earthquake aerial imagery",
      locator:
        "https://oin-hotosm-temp.s3.amazonaws.com/63f21def525f0700077ed4e2/0/63f21def525f0700077ed4e3.tif",
      attribution:
        "OpenAerialMap contributors / Humanitarian OpenStreetMap Team",
      sizeBytes: null,
      delivery: "connected",
      provenance: {
        ...createDefaultSourceProvenance(),
        publisher: "OpenAerialMap",
        sourceUrl: "https://openaerialmap.org/",
        licenseName: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        accessedAt,
        temporalCoverage: { start: "2023-02-06", end: "2023-02-28" },
        spatialCoverage: "Antakya, Hatay Province, Türkiye",
        transformations: [],
      },
      presentation: presentation({
        opacity: 0.94,
        legendTitle: "Post-earthquake aerial imagery",
        legendVisible: false,
      }),
    },
    {
      id: "earthquake-history",
      kind: "csv",
      label: "Significant earthquake records by period",
      path: "assets/earthquake-history.csv",
      attribution:
        "NOAA NCEI Significant Earthquake Database, computed by Earth Stories",
      sizeBytes: null,
      delivery: "included",
      provenance: {
        ...createDefaultSourceProvenance(),
        publisher: "NOAA National Centers for Environmental Information",
        sourceUrl:
          "https://gis.ngdc.noaa.gov/arcgis/rest/services/web_mercator/hazards/MapServer/5",
        accessedAt,
        temporalCoverage: { start: null, end: accessedAt },
        spatialCoverage: "Global",
        transformations: [
          "Counted 6,631 significant-earthquake records in six broad historical periods",
        ],
      },
    },
    {
      id: "earthquake-consequences",
      kind: "csv",
      label: "Selected earthquake magnitudes and reported fatalities",
      path: "assets/earthquake-consequences.csv",
      attribution:
        "NOAA NCEI Significant Earthquake Database, selected by Earth Stories",
      sizeBytes: null,
      delivery: "included",
      provenance: {
        ...createDefaultSourceProvenance(),
        publisher: "NOAA National Centers for Environmental Information",
        sourceUrl:
          "https://gis.ngdc.noaa.gov/arcgis/rest/services/web_mercator/hazards/MapServer/5",
        accessedAt,
        temporalCoverage: { start: "1960-01-01", end: "2023-12-31" },
        spatialCoverage: "Selected global events",
        transformations: [
          "Selected six events to compare magnitude with reported total fatalities",
        ],
      },
    },
    {
      id: "alaska-earthquake-damage",
      kind: "image",
      label: "1964 Alaska earthquake road damage",
      path: "assets/alaska-earthquake-damage.jpg",
      attribution: "U.S. Geological Survey, public domain",
      sizeBytes: null,
      delivery: "included",
      provenance: {
        ...createDefaultSourceProvenance(),
        publisher: "U.S. Geological Survey",
        sourceUrl:
          "https://www.usgs.gov/media/images/1964-alaskan-earthquake-damage",
        licenseName: "Public Domain",
        accessedAt,
        temporalCoverage: { start: "1964-03-27", end: "1964-03-27" },
        spatialCoverage: "Alaska, United States",
        transformations: [],
      },
    },
  ],
  chapters: [
    {
      id: "earthquake-opening",
      type: "prose",
      title: "The planet is never still",
      narrative:
        "Earthquakes feel sudden because people meet them in a moment. Their causes move at a different pace: plates converge, separate, and slide past one another over years, centuries, and geologic eras. This story follows the traces those movements leave in records, faults, coastlines, and cities.",
    },
    {
      id: "earthquake-global-record",
      type: "map",
      title: "A global record of rupture",
      narrative:
        "NOAA's Significant Earthquake Database gathers destructive and otherwise notable events from 2150 BCE to the present. It is a history of earthquakes people noticed and preserved—not a uniform catalog of every time the planet moved.",
      sourceId: "significant-earthquakes",
      camera: {
        center: [12, 8],
        zoom: 1.25,
        bearing: 0,
        pitch: 0,
        globe: true,
      },
    },
    {
      id: "earthquake-observation-history",
      type: "chart",
      title: "The history of observation",
      narrative:
        "The uneven rise in recorded events reflects preservation, reporting, population, and modern instrumentation. The archive becomes denser as written and instrumental records improve; it cannot tell us that earthquakes are becoming more frequent.",
      sourceId: "earthquake-history",
      chartType: "bar",
      xColumn: "period",
      yColumn: "event_count",
      xLabel: "Period",
      yLabel: "Significant events in the NCEI archive",
    },
    {
      id: "earthquake-plate-edges",
      type: "scrolly",
      title: "Where plates meet",
      narrative:
        "Overlay the archive with tectonic plate boundaries and much of its geography comes into focus. Convergent margins, spreading ridges, and transform boundaries organize many earthquakes, while damaging intraplate events remind us that the pattern is powerful but not absolute.",
      sourceId: "significant-earthquakes",
      overlaySourceIds: ["plate-boundaries"],
      transition: "fly-to",
      overlayPosition: "left",
      camera: { center: [138, 20], zoom: 2.2, bearing: 0, pitch: 12 },
    },
    {
      id: "earthquake-ring-of-fire",
      type: "flyover",
      title: "Around the Ring of Fire",
      narrative:
        "Scroll along the Pacific margin, where earthquake and volcano records repeatedly gather around plate edges. The familiar ring is a shorthand for several different boundaries and processes—not a single geologic structure.",
      sourceId: "plate-boundaries",
      overlaySourceIds: ["significant-earthquakes", "holocene-volcanoes"],
      scrollLength: 2.2,
      keyframes: [
        {
          center: [-150, 57],
          zoom: 2.7,
          bearing: 18,
          pitch: 28,
          caption: "Alaska and the Aleutians arc across a subduction boundary.",
          globe: true,
        },
        {
          center: [142, 38],
          zoom: 3.2,
          bearing: -12,
          pitch: 35,
          caption: "Japan sits where several plates and microplates meet.",
          globe: true,
        },
        {
          center: [122, -4],
          zoom: 3,
          bearing: 12,
          pitch: 38,
          caption:
            "Indonesia's island arcs record repeated earthquakes and eruptions.",
          globe: true,
        },
        {
          center: [-73, -28],
          zoom: 2.8,
          bearing: 2,
          pitch: 34,
          caption:
            "Along South America, the Nazca Plate descends beneath the continent.",
          globe: true,
        },
      ],
    },
    {
      id: "earthquake-us-faults",
      type: "map",
      title: "Faults beneath the United States",
      narrative:
        "The Quaternary Fault and Fold Database maps geologic evidence of surface deformation during roughly the past 1.6 million years. Faults are evidence of past movement and inputs to hazard assessment—not a schedule of the next earthquake.",
      sourceId: "quaternary-faults",
      overlaySourceIds: ["significant-earthquakes"],
      camera: { center: [-116, 39], zoom: 3.6, bearing: 0, pitch: 22 },
    },
    {
      id: "earthquake-consequence-chart",
      type: "chart",
      title: "Magnitude is not consequence",
      narrative:
        "A magnitude describes an earthquake's physical size, not the vulnerability of the places it reaches. These selected records show how settlement, construction, secondary hazards, and response can separate a very large rupture from a very large human toll. Reported fatalities include downstream effects and retain the uncertainties of disaster records.",
      sourceId: "earthquake-consequences",
      chartType: "bar",
      xColumn: "event",
      yColumn: "reported_deaths",
      xLabel: "Selected event",
      yLabel: "Reported total fatalities (log scale)",
      yScale: "log",
    },
    {
      id: "earthquake-tsunami",
      type: "scrolly",
      title: "When the ocean carries the shock",
      narrative:
        "A tsunami source and the places that observe its waves can be far apart. Event points and observation points reveal that reach across the Pacific, but they should be linked through source identifiers where available; proximity on this map alone does not prove which event produced an observation.",
      sourceId: "tsunami-events",
      overlaySourceIds: ["tsunami-observations", "plate-boundaries"],
      transition: "fly-to",
      overlayPosition: "right",
      camera: { center: [-157, 2], zoom: 2, bearing: 0, pitch: 8 },
    },
    {
      id: "earthquake-road-image",
      type: "image",
      title: "When the map becomes a road",
      narrative:
        "Hazard layers turn rupture into points and lines so patterns can be compared. On the ground, movement arrives as broken pavement, displaced foundations, severed utilities, and routes that no longer connect the way they did the day before.",
      sourceId: "alaska-earthquake-damage",
      alt: "A roadway split and displaced by ground movement during the 1964 Alaska earthquake.",
      caption:
        "Damage from the 1964 Alaska earthquake. U.S. Geological Survey, public domain.",
    },
    {
      id: "earthquake-antakya",
      type: "scrolly",
      title: "Antakya, block by block",
      narrative:
        "After the February 2023 Türkiye–Syria earthquakes, open aerial imagery made damage legible at the scale of individual blocks. This connected cloud-optimized GeoTIFF is a post-event view, not a complete damage assessment; it shows what was visible to the flight and sensor at that time.",
      sourceId: "antakya-aerial",
      transition: "fly-to",
      overlayPosition: "left",
      camera: {
        center: [36.1995, 36.229],
        zoom: 16.5,
        bearing: 12,
        pitch: 42,
      },
    },
    {
      id: "earthquake-shared-landscape",
      type: "map",
      title: "Hazards share a landscape",
      narrative:
        "Earthquakes, volcanoes, and tsunamis often occupy the same tectonic settings. Layering their historical records reveals shared geography, but nearby records can share a setting without proving that one event caused another.",
      sourceId: "significant-earthquakes",
      overlaySourceIds: [
        "plate-boundaries",
        "holocene-volcanoes",
        "significant-volcanic-events",
        "tsunami-events",
      ],
      camera: { center: [139, 34], zoom: 2.8, bearing: -4, pitch: 18 },
    },
    {
      id: "earthquake-close",
      type: "prose",
      title: "What the archive remembers",
      narrative:
        "This story joins seven anticipated HIFLD Next PMTiles sources with NOAA-derived charts, a USGS photograph, and OpenAerialMap imagery. Every layer is a partial record made for a particular purpose. Read together, they show how the ground's long memory becomes evidence—without turning evidence into prediction.",
    },
  ],
};

export const electricGridStory: StoryProject = {
  schema: "earth-stories/project/v2",
  id: "example-electric-grid",
  metadata: {
    title: "The Grid Between Us",
    description:
      "Trace the generators, lines, territories, fuels, and roadside infrastructure behind an ordinary electric switch.",
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
    hifldSource({
      id: "power-plants",
      slug: "power-plants-1",
      label: "Power plants",
      attribution: "Oak Ridge National Laboratory / EIA / HIFLD Next",
      publisher:
        "Oak Ridge National Laboratory and U.S. Department of Homeland Security",
      spatialCoverage: "United States",
      temporalCoverage: { start: "2011-11-30", end: "2024-08-07" },
      presentation: presentation({
        color: "#e5484d",
        radius: 4,
        legendTitle: "Power plants",
      }),
    }),
    hifldSource({
      id: "generating-units",
      slug: "generating-units-1",
      label: "Generating units",
      attribution: "Oak Ridge National Laboratory / EIA / HIFLD Next",
      publisher:
        "Oak Ridge National Laboratory and U.S. Department of Homeland Security",
      spatialCoverage: "United States",
      temporalCoverage: { start: "2011-11-30", end: "2024-08-07" },
      presentation: presentation({
        opacity: 0.72,
        color: "#f2b134",
        radius: 3,
        legendTitle: "Generating units",
      }),
    }),
    hifldSource({
      id: "transmission-lines",
      slug: "transmission-lines-1",
      label: "Electric power transmission lines",
      attribution: "Oak Ridge National Laboratory / HIFLD Next",
      publisher:
        "Oak Ridge National Laboratory and U.S. Department of Homeland Security",
      spatialCoverage: "United States",
      presentation: presentation({
        opacity: 0.78,
        color: "#3e63dd",
        strokeColor: "#3e63dd",
        legendTitle: "Transmission lines",
      }),
    }),
    hifldSource({
      id: "nerc-regions",
      slug: "nerc-regions",
      label: "NERC regions and subregions",
      attribution:
        "North American Electric Reliability Corporation / HIFLD Next",
      publisher: "U.S. Department of Homeland Security",
      spatialCoverage: "United States",
      temporalCoverage: { start: "2022-12-10", end: "2022-12-10" },
      presentation: presentation({
        opacity: 0.24,
        color: "#5b5bd6",
        strokeColor: "#5b5bd6",
        legendTitle: "NERC regions",
      }),
    }),
    hifldSource({
      id: "reliability-coordinators",
      slug: "nerc-reliability-coordinators-1",
      label: "NERC reliability coordinators",
      attribution:
        "North American Electric Reliability Corporation / HIFLD Next",
      publisher: "U.S. Department of Homeland Security",
      spatialCoverage: "United States",
      presentation: presentation({
        opacity: 0.2,
        color: "#8e4ec6",
        strokeColor: "#8e4ec6",
        legendTitle: "Reliability coordinators",
      }),
    }),
    hifldSource({
      id: "retail-service-territories",
      slug: "electric-retail-service-territories",
      label: "Electric retail service territories",
      attribution: "Oak Ridge National Laboratory / HIFLD Next",
      publisher:
        "Oak Ridge National Laboratory and U.S. Department of Homeland Security",
      spatialCoverage: "Canada and United States",
      temporalCoverage: { start: "2024-09-30", end: "2024-09-30" },
      presentation: presentation({
        opacity: 0.22,
        color: "#29a383",
        strokeColor: "#18794e",
        legendTitle: "Retail service territories",
      }),
    }),
    hifldSource({
      id: "electric-planning-areas",
      slug: "electric-planning-areas",
      label: "Electric planning areas",
      attribution: "Oak Ridge National Laboratory / HIFLD Next",
      publisher:
        "Oak Ridge National Laboratory and U.S. Department of Homeland Security",
      spatialCoverage: "United States",
      temporalCoverage: { start: "2022-12-10", end: "2022-12-10" },
      presentation: presentation({
        opacity: 0.15,
        color: "#12a594",
        strokeColor: "#0e7490",
        legendTitle: "Planning areas",
      }),
    }),
    hifldSource({
      id: "natural-gas-pipelines",
      slug: "natural-gas-interstate-and-intrastate-pipelines",
      label: "Natural gas interstate and intrastate pipelines",
      attribution: "U.S. Energy Information Administration / HIFLD Next",
      publisher: "U.S. Energy Information Administration",
      spatialCoverage: "United States",
      temporalCoverage: { start: null, end: "2020-01-31" },
      transformations: [
        "HIFLD Next conversion of the archived January 2020 layer to version-pinned vector PMTiles",
      ],
      presentation: presentation({
        opacity: 0.74,
        color: "#d97706",
        strokeColor: "#d97706",
        legendTitle: "Natural gas pipelines (January 2020 archive)",
      }),
    }),
    hifldSource({
      id: "alternative-fueling-stations",
      slug: "alternative-fueling-stations",
      label: "Alternative fueling stations",
      attribution: "NREL Alternative Fuels Data Center / HIFLD Next",
      publisher: "National Renewable Energy Laboratory",
      spatialCoverage: "United States",
      temporalCoverage: { start: "2010-07-01", end: "2024-10-22" },
      presentation: presentation({
        color: "#30a46c",
        radius: 3,
        legendTitle: "Alternative fueling stations",
      }),
    }),
    {
      id: "generation-by-fuel",
      kind: "csv",
      label: "Summer generating capacity by fuel family",
      path: "assets/generation-by-fuel.csv",
      attribution:
        "HIFLD-derived Power_Plants service, computed by Earth Stories",
      sizeBytes: null,
      delivery: "included",
      provenance: {
        ...createDefaultSourceProvenance(),
        publisher: "HIFLD-derived public ArcGIS service",
        sourceUrl:
          "https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/Power_Plants/FeatureServer/0",
        dataUpdatedAt: "2018-04-30",
        accessedAt,
        spatialCoverage: "Contiguous United States",
        transformations: [
          "Summed SUMMER_CAP by PRIMARY_FU",
          "Grouped EIA primary fuel codes into ten reader-facing fuel families",
          "Rounded megawatt totals to the nearest whole megawatt",
        ],
      },
    },
    {
      id: "energy-hardware",
      kind: "image",
      label: "Wind, solar, and transmission infrastructure",
      path: "assets/energy-hardware.png",
      attribution:
        "P. Cryan, M. Huso, and S. Kemp / U.S. Geological Survey, public domain",
      sizeBytes: null,
      delivery: "included",
      provenance: {
        ...createDefaultSourceProvenance(),
        publisher: "U.S. Geological Survey",
        sourceUrl:
          "https://www.usgs.gov/media/images/wind-trubines-and-photovoltaic-cell-array-and-transmission-lines",
        licenseName: "Public Domain",
        accessedAt,
        spatialCoverage: "United States",
        transformations: [
          "Palette-optimized with pngquant for bundled delivery; full pixel dimensions preserved",
        ],
      },
    },
  ],
  chapters: [
    {
      id: "grid-opening",
      type: "prose",
      title: "Electricity begins somewhere",
      narrative:
        "A switch hides distance. The electricity reaching a room may begin at a turbine, dam, reactor, solar array, or wind farm; cross a high-voltage network; pass through several institutions; and arrive inside a local utility territory. This story maps those pieces without pretending the map can show the grid's live behavior.",
    },
    {
      id: "grid-plants",
      type: "map",
      title: "Thousands of places making power",
      narrative:
        "The HIFLD power-plants layer turns generation into a national geography of facilities. Each point represents a plant, but plant count is not capacity, and capacity is not generation: facilities differ enormously in size, technology, operating schedule, and output.",
      sourceId: "power-plants",
      camera: { center: [-98, 38], zoom: 3.15, bearing: 0, pitch: 12 },
    },
    {
      id: "grid-fuel-chart",
      type: "chart",
      title: "The fuels behind the switch",
      narrative:
        "This included historical snapshot sums summer capacity in a public HIFLD-derived plant service, grouped into broad fuel families. It describes the service's 2018-era records—not today's fleet and not actual electricity generated. The large 'other / unavailable' bar is a reminder that source completeness matters.",
      sourceId: "generation-by-fuel",
      chartType: "bar",
      xColumn: "fuel_family",
      yColumn: "summer_capacity_mw",
      xLabel: "Primary fuel family",
      yLabel: "Summer capacity (MW)",
    },
    {
      id: "grid-regional-mix",
      type: "scrolly",
      title: "A different grid in every region",
      narrative:
        "Plant geography changes across the country: hydroelectric capacity follows river systems, wind follows strong resource corridors, solar concentrates where sunlight and policy align, and thermal plants reflect fuel access and decades of investment. NERC regions provide operational context, not a claim that electricity stops at their borders.",
      sourceId: "power-plants",
      overlaySourceIds: ["nerc-regions"],
      transition: "fly-to",
      overlayPosition: "left",
      camera: { center: [-106, 39], zoom: 3.7, bearing: 0, pitch: 18 },
    },
    {
      id: "grid-generating-units",
      type: "map",
      title: "One plant, many machines",
      narrative:
        "A plant is a facility; a generating unit is an individual machine or generator within it. Overlaying units with plants exposes that nested structure and helps explain why two points at nearly the same coordinate can describe different levels of the same system.",
      sourceId: "generating-units",
      overlaySourceIds: ["power-plants"],
      camera: { center: [-90.2, 38.7], zoom: 6.2, bearing: 0, pitch: 28 },
    },
    {
      id: "grid-transmission-flyover",
      type: "flyover",
      title: "The long-distance grid",
      narrative:
        "Follow the mapped transmission network from western generation corridors toward the country's central and eastern load centers. These geometries show where lines were cataloged; they do not reveal electrical flow, loading, congestion, outages, switching, or real-time condition.",
      sourceId: "transmission-lines",
      overlaySourceIds: ["power-plants"],
      scrollLength: 2.2,
      keyframes: [
        {
          center: [-121, 45],
          zoom: 4.3,
          bearing: 30,
          pitch: 38,
          caption:
            "Northwestern corridors connect large hydroelectric resources with distant demand.",
        },
        {
          center: [-110, 39],
          zoom: 4.2,
          bearing: 55,
          pitch: 42,
          caption: "Western lines cross long distances and difficult terrain.",
        },
        {
          center: [-97, 38],
          zoom: 4.1,
          bearing: 72,
          pitch: 40,
          caption:
            "Across the Plains, generation and transmission share broad infrastructure corridors.",
        },
        {
          center: [-82, 39],
          zoom: 4.2,
          bearing: 84,
          pitch: 36,
          caption:
            "The eastern network becomes denser around cities, industry, and older infrastructure.",
        },
      ],
    },
    {
      id: "grid-reliability",
      type: "map",
      title: "Who keeps the system connected",
      narrative:
        "Reliability coordinators maintain a wide-area view and help coordinate operations across utilities and balancing authorities. Their mapped footprints describe responsibility and oversight; they are not physical circuits and can overlap the ways electricity actually moves.",
      sourceId: "reliability-coordinators",
      overlaySourceIds: ["nerc-regions", "transmission-lines"],
      camera: { center: [-98, 38], zoom: 3.3, bearing: 0, pitch: 8 },
    },
    {
      id: "grid-customer-boundaries",
      type: "scrolly",
      title: "The boundaries customers inherit",
      narrative:
        "Retail service territories describe which utility sells electricity to local customers, while planning areas describe longer-term coordination. These responsibility boundaries are not electrical walls: power can be generated, scheduled, and transmitted across many institutional footprints before reaching a bill.",
      sourceId: "retail-service-territories",
      overlaySourceIds: ["electric-planning-areas", "transmission-lines"],
      transition: "fly-to",
      overlayPosition: "right",
      camera: { center: [-84, 36.5], zoom: 4.6, bearing: 0, pitch: 18 },
    },
    {
      id: "grid-gas-pipelines",
      type: "scrolly",
      title: "The pipeline behind the power line",
      narrative:
        "Natural-gas plants depend on a fuel system that has its own long-distance geography. This pipeline layer is an archived January 2020 view, and visual proximity does not prove that a particular pipeline supplies a particular plant; network contracts, interconnections, and operating data are needed for that claim.",
      sourceId: "natural-gas-pipelines",
      overlaySourceIds: ["power-plants", "transmission-lines"],
      transition: "fly-to",
      overlayPosition: "left",
      camera: { center: [-92, 30.5], zoom: 4.4, bearing: -8, pitch: 30 },
    },
    {
      id: "grid-hardware-image",
      type: "image",
      title: "The hardware behind the abstraction",
      narrative:
        "Points and lines make infrastructure comparable, but the system remains physical: towers, conductors, turbines, photovoltaic modules, substations, and rights-of-way occupy real land and require maintenance. A map of assets is an index to that hardware, not a substitute for seeing its scale.",
      sourceId: "energy-hardware",
      alt: "A blended U.S. Geological Survey image showing wind turbines, a photovoltaic array, and electric transmission infrastructure.",
      caption:
        "Wind and solar energy facilities. Photos by P. Cryan and M. Huso; blended by S. Kemp, U.S. Geological Survey. Public domain.",
    },
    {
      id: "grid-roadside",
      type: "map",
      title: "Electricity moves onto the road",
      narrative:
        "Alternative-fueling stations extend the energy system into transportation. This layer includes multiple fuels, access types, and statuses; a mapped point does not establish that a charger is operating, available, affordable, heavily used, or supported by spare local grid capacity.",
      sourceId: "alternative-fueling-stations",
      overlaySourceIds: ["retail-service-territories"],
      camera: { center: [-98, 38], zoom: 3.25, bearing: 0, pitch: 10 },
    },
    {
      id: "grid-close",
      type: "prose",
      title: "What this map cannot tell us",
      narrative:
        "This story joins nine anticipated HIFLD Next PMTiles sources with a historical capacity summary and a USGS image. It can show assets, adjacency, and institutional geography. It cannot show live power flows, reliability, emissions, prices, equity, or the condition of equipment—questions that need operational, temporal, and community data beyond this catalog.",
    },
  ],
};
