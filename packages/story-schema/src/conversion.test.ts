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
});
