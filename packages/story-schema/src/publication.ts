import { z } from "zod";
import {
  cameraSchema,
  createDefaultSourceProvenance,
  flyoverKeyframeSchema,
  sourceProvenanceSchema,
} from "./project.js";

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  }, "Use an HTTP or HTTPS URL");

export const publicationAssetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum([
    "geojson",
    "pmtiles",
    "cog",
    "xyz",
    "geoparquet",
    "image",
    "csv",
    "zarr",
    "trajectory",
    "copc",
  ]),
  delivery: z.enum(["included", "connected"]),
  href: z.string().min(1),
  attribution: z.string().nullable(),
  provenance: sourceProvenanceSchema.default(createDefaultSourceProvenance),
  sizeBytes: z.number().int().nonnegative().nullable(),
  tileType: z.enum(["raster", "vector"]).nullable(),
  presentation: z.object({
    opacity: z.number().min(0).max(1),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    strokeColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    radius: z.number().min(1).max(40),
    sourceLayer: z.string().nullable(),
    rasterBand: z.number().int().positive(),
    rescale: z.tuple([z.number(), z.number()]).nullable(),
    colormap: z.enum(["viridis", "magma", "terrain", "grayscale"]),
    legendTitle: z.string(),
    legendVisible: z.boolean(),
    symbolProperty: z.string().nullable(),
    categoryColors: z.record(z.string(), z.string().regex(/^#[0-9a-f]{6}$/i)),
    filterProperty: z.string().nullable(),
    filterValue: z.string().nullable(),
  }),
  zarr: z
    .object({
      variable: z.string().min(1),
      selection: z.record(z.string(), z.number().int().nonnegative()),
      timeDimension: z.string().nullable(),
      timesteps: z.array(
        z.object({ label: z.string(), index: z.number().int().nonnegative() }),
      ),
      geozarr: z
        .object({
          dimensions: z.tuple([z.string(), z.string()]),
          transform: z.tuple([
            z.number(),
            z.number(),
            z.number(),
            z.number(),
            z.number(),
            z.number(),
          ]),
          shape: z.tuple([
            z.number().int().positive(),
            z.number().int().positive(),
          ]),
          crs: z.string(),
        })
        .nullable(),
    })
    .nullable(),
  cog: z
    .object({
      epsg: z.number().int().positive(),
      definition: z.string().min(1),
    })
    .nullable()
    .default(null),
  trajectory: z.object({ trailLength: z.number().positive() }).nullable(),
  copc: z
    .object({
      colorMode: z.enum(["elevation", "intensity", "classification", "rgb"]),
      pointSize: z.number().min(1).max(10),
    })
    .nullable(),
});

const publicationChapterBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  narrative: z.string(),
});

export const publicationChapterSchema = z.discriminatedUnion("type", [
  publicationChapterBaseSchema.extend({ type: z.literal("prose") }),
  publicationChapterBaseSchema.extend({
    type: z.literal("map"),
    camera: cameraSchema,
    assetId: z.string().min(1),
    overlayAssetIds: z.array(z.string().min(1)),
    transition: z.enum(["fly-to", "instant"]),
    temporalPosition: z.number().min(0).max(1).optional(),
  }),
  publicationChapterBaseSchema.extend({
    type: z.literal("scrolly"),
    camera: cameraSchema,
    assetId: z.string().min(1),
    overlayAssetIds: z.array(z.string().min(1)),
    transition: z.enum(["fly-to", "instant"]),
    overlayPosition: z.enum(["left", "right"]),
    temporalPosition: z.number().min(0).max(1).optional(),
  }),
  publicationChapterBaseSchema.extend({
    type: z.literal("image"),
    assetId: z.string().min(1),
    alt: z.string(),
    caption: z.string(),
  }),
  publicationChapterBaseSchema.extend({
    type: z.literal("chart"),
    assetId: z.string().min(1),
    chartType: z.enum(["bar", "line"]),
    xColumn: z.string().min(1),
    yColumn: z.string().min(1),
    yColumns: z.array(z.string().min(1)),
    seriesColumn: z.string().nullable(),
    xLabel: z.string(),
    yLabel: z.string(),
    yScale: z.enum(["linear", "log"]),
    xMin: z.union([z.number(), z.string()]).nullable(),
    xMax: z.union([z.number(), z.string()]).nullable(),
  }),
  publicationChapterBaseSchema.extend({
    type: z.literal("video"),
    provider: z.enum(["youtube", "vimeo"]),
    videoId: z.string().min(1),
    originalUrl: httpUrlSchema,
  }),
  publicationChapterBaseSchema.extend({
    type: z.literal("flyover"),
    assetId: z.string().min(1).nullable(),
    overlayAssetIds: z.array(z.string().min(1)),
    keyframes: z.array(flyoverKeyframeSchema).min(2),
    scrollLength: z.number().min(0.5).max(5),
  }),
]);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const requirementSchema = z.enum(["network", "cors", "byte-ranges"]);
const dependencyBaseFields = {
  id: z.string().min(1),
  owner: z.object({
    type: z.enum(["basemap", "source", "chapter", "runtime"]),
    id: z.string().min(1),
  }),
  locator: z.string().min(1),
  estimatedBytes: z.number().int().nonnegative().nullable(),
};

const includedDependencySchema = z.object({
  ...dependencyBaseFields,
  delivery: z.literal("included"),
  materialization: z.enum(["copy-local", "download-file", "bundle-runtime"]),
  requirements: z.array(z.literal("byte-ranges")),
  sha256: sha256Schema,
});

const connectedDependencySchema = z
  .object({
    ...dependencyBaseFields,
    delivery: z.literal("connected"),
    materialization: z.literal("none"),
    requirements: z.array(requirementSchema),
  })
  .refine(({ requirements }) => requirements.includes("network"), {
    message: "Connected dependencies must require network access",
    path: ["requirements"],
  });

const unsupportedDependencySchema = z.object({
  ...dependencyBaseFields,
  delivery: z.literal("unsupported"),
  materialization: z.literal("none"),
  requirements: z.array(requirementSchema),
  reason: z.string().trim().min(1),
});

export const publicationDependencySchema = z.discriminatedUnion("delivery", [
  includedDependencySchema,
  connectedDependencySchema,
  unsupportedDependencySchema,
]);

export const publicationConnectivitySchema = z.intersection(
  z.object({
    requested: z.enum(["connected", "portable", "custom", "offline"]),
  }),
  z.discriminatedUnion("state", [
    z.object({ state: z.literal("pending") }),
    z.object({
      state: z.literal("verified"),
      verified: z.enum(["connected", "offline"]),
    }),
    z.object({ state: z.literal("failed"), reasonCode: z.string().min(1) }),
  ]),
);

export const publicationBasemapSchema = z.discriminatedUnion("delivery", [
  z.object({
    delivery: z.literal("connected"),
    id: z.string().min(1),
    label: z.string().min(1),
    styleUrl: httpUrlSchema,
    attribution: z.string().nullable(),
  }),
  z.object({
    delivery: z.literal("included"),
    id: z.string().min(1),
    label: z.string().min(1),
    styleHref: z.string().min(1),
    attribution: z.string().nullable(),
  }),
]);

const buildSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  projectDigest: sha256Schema,
  runtimeVersion: z.string().min(1),
  dependencyDigests: z
    .array(z.object({ id: z.string().min(1), sha256: sha256Schema }))
    .default([]),
});

const publicationManifestSharedFields = {
  build: buildSchema,
  metadata: z.object({
    title: z.string().min(1),
    description: z.string(),
    author: z.string().nullable(),
  }),
  assets: z.array(publicationAssetSchema),
  chapters: z.array(publicationChapterSchema).min(1),
  externalDependencies: z.array(
    z.object({
      resourceId: z.string().min(1),
      href: z.string().min(1),
      requirements: z.array(z.enum(["network", "cors", "byte-ranges"])),
    }),
  ),
  hostingRequirements: z.array(z.enum(["static-http", "cors", "byte-ranges"])),
};

export const publicationManifestV1Schema = z.object({
  schema: z.literal("earth-stories/publication/v1"),
  ...publicationManifestSharedFields,
  publication: z.object({
    profile: z.enum(["connected", "portable", "custom"]),
    theme: z.enum(["cng", "editorial"]),
  }),
  basemap: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    styleUrl: httpUrlSchema,
    attribution: z.string().nullable(),
  }),
});

export const publicationManifestV2Schema = z
  .object({
    schema: z.literal("earth-stories/publication/v2"),
    ...publicationManifestSharedFields,
    publication: z.object({
      profile: z.enum(["connected", "portable", "custom", "offline"]),
      theme: z.enum(["cng", "editorial"]),
    }),
    basemap: publicationBasemapSchema,
    connectivity: publicationConnectivitySchema,
    dependencies: z.array(publicationDependencySchema),
    projectionDefinitions: z
      .array(
        z.object({
          epsg: z.number().int().positive(),
          definition: z.string().min(1),
        }),
      )
      .default([]),
    runtimeAssets: z
      .array(
        z.object({
          id: z.string().min(1),
          href: z.string().min(1),
          sha256: sha256Schema,
        }),
      )
      .default([]),
  })
  .superRefine((manifest, context) => {
    if (manifest.connectivity.requested !== manifest.publication.profile)
      context.addIssue({
        code: "custom",
        path: ["connectivity", "requested"],
        message: "Connectivity request must match the publication profile",
      });
    if (
      manifest.connectivity.state === "verified" &&
      ((manifest.connectivity.requested === "offline" &&
        manifest.connectivity.verified !== "offline") ||
        (manifest.connectivity.requested !== "offline" &&
          manifest.connectivity.verified === "offline"))
    )
      context.addIssue({
        code: "custom",
        path: ["connectivity", "verified"],
        message: "Verified connectivity contradicts the requested profile",
      });
    if (
      manifest.publication.profile === "offline" ||
      manifest.connectivity.requested === "offline"
    ) {
      const invalid = manifest.dependencies.find(
        ({ delivery }) => delivery !== "included",
      );
      if (invalid)
        context.addIssue({
          code: "custom",
          path: ["dependencies"],
          message: `Offline manifests may contain only included dependencies; ${invalid.id} is ${invalid.delivery}`,
        });
      if (manifest.externalDependencies.length)
        context.addIssue({
          code: "custom",
          path: ["externalDependencies"],
          message: "Offline manifests cannot contain external dependencies",
        });
      if (manifest.basemap.delivery !== "included")
        context.addIssue({
          code: "custom",
          path: ["basemap"],
          message: "Offline manifests require an included basemap",
        });
      if (manifest.assets.some(({ delivery }) => delivery === "connected"))
        context.addIssue({
          code: "custom",
          path: ["assets"],
          message: "Offline manifests cannot contain connected assets",
        });
    }
  });

function migratePublicationManifestV1(value: unknown): unknown {
  const legacy = publicationManifestV1Schema.parse(value);
  const legacyDependencies = [
    ...(legacy.externalDependencies.some(
      ({ resourceId }) => resourceId === legacy.basemap.id,
    )
      ? []
      : [
          {
            resourceId: legacy.basemap.id,
            href: legacy.basemap.styleUrl,
            requirements: ["network", "cors"] as const,
          },
        ]),
    ...legacy.externalDependencies,
  ];
  return {
    ...legacy,
    schema: "earth-stories/publication/v2" as const,
    basemap: { delivery: "connected" as const, ...legacy.basemap },
    connectivity: {
      requested: legacy.publication.profile,
      state: "pending" as const,
    },
    dependencies: legacyDependencies.map((dependency) => ({
      id: `legacy:${dependency.resourceId}`,
      owner: {
        type:
          dependency.resourceId === legacy.basemap.id
            ? ("basemap" as const)
            : ("source" as const),
        id: dependency.resourceId,
      },
      locator: dependency.href,
      estimatedBytes: null,
      delivery: "connected" as const,
      materialization: "none" as const,
      requirements: dependency.requirements.includes("network")
        ? dependency.requirements
        : (["network", ...dependency.requirements] as Array<
            "network" | "cors" | "byte-ranges"
          >),
    })),
    projectionDefinitions: [],
    runtimeAssets: [],
  };
}

/** Canonical publication schema. V1 input is normalized to v2. */
export const publicationManifestSchema = z.preprocess((value) => {
  if (
    value &&
    typeof value === "object" &&
    (value as { schema?: unknown }).schema === "earth-stories/publication/v1"
  )
    return migratePublicationManifestV1(value);
  return value;
}, publicationManifestV2Schema);

export function parsePublicationManifest(value: unknown): PublicationManifest {
  return publicationManifestSchema.parse(value);
}

export function publicationBasemapHref(basemap: PublicationBasemap): string {
  return basemap.delivery === "connected"
    ? basemap.styleUrl
    : basemap.styleHref;
}

export type PublicationAsset = z.infer<typeof publicationAssetSchema>;
export type PublicationProvenance = PublicationAsset["provenance"];
export type PublicationChapter = z.infer<typeof publicationChapterSchema>;
export type PublicationDependency = z.infer<typeof publicationDependencySchema>;
export type PublicationBasemap = z.infer<typeof publicationBasemapSchema>;
export type PublicationConnectivity = z.infer<
  typeof publicationConnectivitySchema
>;
export type PublicationManifestV1 = z.infer<typeof publicationManifestV1Schema>;
export type PublicationManifest = z.infer<typeof publicationManifestV2Schema>;
