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
  conversionProgressSchema,
  conversionResultSchema,
  conversionFailureSchema,
]);

export type ConversionCapability = z.infer<typeof conversionCapabilitySchema>;
export type ConversionOperation = z.infer<typeof conversionOperationSchema>;
export type ConversionJobRequest = z.infer<typeof conversionJobRequestSchema>;
export type ConversionJobEvent = z.infer<typeof conversionJobEventSchema>;
