import { z } from "zod";

export const CONVERSION_PROTOCOL_VERSION =
  "earth-stories/conversion/v1" as const;

export const conversionCapabilitySchema = z.enum([
  "core",
  "vector",
  "raster",
  "multidim",
  "pointcloud",
]);

export const CONVERSION_CAPABILITIES = conversionCapabilitySchema.options;

export const CAPABILITY_INSTALL_ESTIMATES = {
  core: {
    name: "Core data inspection",
    estimatedBytes: 321_812_028,
    estimateKind: "measured-apparent-installed-footprint",
  },
  vector: {
    name: "Vector preparation",
    estimatedBytes: 430_000_000,
    estimateKind: "estimated-apparent-installed-footprint",
  },
  raster: {
    name: "Raster preparation",
    estimatedBytes: 668_962_511,
    estimateKind: "measured-apparent-installed-footprint",
  },
  multidim: {
    name: "Multidimensional preparation",
    estimatedBytes: 410_000_000,
    estimateKind: "estimated-apparent-installed-footprint",
  },
  pointcloud: {
    name: "Point-cloud preparation",
    estimatedBytes: 310_000_000,
    estimateKind: "estimated-apparent-installed-footprint",
  },
} as const satisfies Record<
  (typeof CONVERSION_CAPABILITIES)[number],
  {
    name: string;
    estimatedBytes: number;
    estimateKind:
      | "measured-apparent-installed-footprint"
      | "estimated-apparent-installed-footprint";
  }
>;

export const conversionOperationSchema = z.enum([
  "inspect",
  "configure",
  "prepare",
  "verify",
]);

export const conversionInputSchema = z.object({
  path: z.string().min(1),
  filename: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  mediaType: z.string().nullable().default(null),
});

export const conversionJobRequestSchema = z
  .object({
    protocol: z.literal(CONVERSION_PROTOCOL_VERSION),
    requestId: z.string().min(1),
    projectId: z.string().min(1),
    operation: conversionOperationSchema,
    capability: conversionCapabilitySchema,
    input: conversionInputSchema,
    options: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const conversionProgressSchema = z
  .object({
    protocol: z.literal(CONVERSION_PROTOCOL_VERSION),
    requestId: z.string().min(1),
    type: z.literal("progress"),
    stage: z.enum([
      "queued",
      "provisioning",
      "inspecting",
      "preparing",
      "verifying",
    ]),
    completed: z.number().min(0),
    total: z.number().positive().nullable(),
    unit: z.enum(["bytes", "features", "steps"]),
    message: z.string(),
  })
  .strict();

export const provisioningDisclosureSchema = z
  .object({
    protocol: z.literal(CONVERSION_PROTOCOL_VERSION),
    requestId: z.string().min(1),
    type: z.literal("provisioning-disclosure"),
    capability: conversionCapabilitySchema,
    capabilityName: z.string().min(1),
    versions: z.array(z.string().min(1)).min(1),
    estimatedBytes: z.number().int().positive(),
    estimateKind: z.enum([
      "measured-apparent-installed-footprint",
      "estimated-apparent-installed-footprint",
    ]),
    destination: z.string().min(1),
    credits: z
      .array(
        z
          .object({
            name: z.string().min(1),
            license: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const conversionResultSchema = z
  .object({
    protocol: z.literal(CONVERSION_PROTOCOL_VERSION),
    requestId: z.string().min(1),
    type: z.literal("result"),
    status: z.literal("succeeded"),
    output: z.record(z.string(), z.unknown()),
    tools: z.array(
      z.object({ name: z.string().min(1), version: z.string().min(1) }),
    ),
    warnings: z.array(z.string()).default([]),
  })
  .strict();

export const conversionFailureSchema = z
  .object({
    protocol: z.literal(CONVERSION_PROTOCOL_VERSION),
    requestId: z.string().min(1),
    type: z.literal("failure"),
    status: z.enum(["failed", "cancelled"]),
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const conversionJobEventSchema = z.discriminatedUnion("type", [
  provisioningDisclosureSchema,
  conversionProgressSchema,
  conversionResultSchema,
  conversionFailureSchema,
]);

export type ConversionCapability = z.infer<typeof conversionCapabilitySchema>;
export type ConversionOperation = z.infer<typeof conversionOperationSchema>;
export type ConversionJobRequest = z.infer<typeof conversionJobRequestSchema>;
export type ConversionJobEvent = z.infer<typeof conversionJobEventSchema>;
