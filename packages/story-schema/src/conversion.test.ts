import { describe, expect, it } from "vitest";
import {
  conversionJobEventSchema,
  conversionJobRequestSchema,
} from "./conversion.js";

describe("conversion protocol", () => {
  it("accepts a versioned inspect request", () => {
    expect(
      conversionJobRequestSchema.parse({
        protocol: "earth-stories/conversion/v1",
        requestId: "request-1",
        projectId: "project-1",
        operation: "inspect",
        capability: "vector",
        input: {
          path: "assets/places.csv",
          filename: "places.csv",
          sizeBytes: 42,
          mediaType: "text/csv",
        },
      }).options,
    ).toEqual({});
  });

  it("rejects unversioned and malformed worker events", () => {
    expect(() =>
      conversionJobEventSchema.parse({
        requestId: "request-1",
        type: "failure",
        status: "failed",
        code: "invalid-input",
        message: "No geometry column",
        retryable: false,
      }),
    ).toThrow();
  });

  it("carries the complete author disclosure before provisioning", () => {
    expect(
      conversionJobEventSchema.parse({
        protocol: "earth-stories/conversion/v1",
        requestId: "request-1",
        type: "provisioning-disclosure",
        capability: "raster",
        capabilityName: "Raster preparation",
        versions: ["GDAL >=3.10,<4", "Rasterio >=1.4,<2"],
        estimatedBytes: 668_962_511,
        estimateKind: "measured-installed-footprint",
        destination: "/profile/tools/0.1.0-lock/.pixi/envs/raster",
        credits: [
          { name: "Pixi", license: "BSD-3-Clause" },
          {
            name: "conda-forge packages",
            license: "See pixi.lock and notices",
          },
        ],
      }),
    ).toMatchObject({
      type: "provisioning-disclosure",
      estimatedBytes: 668_962_511,
      estimateKind: "measured-installed-footprint",
    });
  });
});
