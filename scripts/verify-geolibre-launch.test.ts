import { describe, expect, it } from "vitest";
import { verifyGeoLibreLaunch } from "./verify-geolibre-launch.js";

describe("verifyGeoLibreLaunch", () => {
  it("decodes the exact deployed companion URL", () => {
    expect(
      verifyGeoLibreLaunch({
        publicationUrl: "https://example.org/proof/",
        href: `https://web.geolibre.app/?url=${encodeURIComponent("https://example.org/proof/explore/story.geolibre.json")}&layout=viewer`,
      }),
    ).toEqual({
      status: "passed",
      companionUrl: "https://example.org/proof/explore/story.geolibre.json",
    });
  });

  it("rejects a handoff to a different companion", () => {
    expect(
      verifyGeoLibreLaunch({
        publicationUrl: "https://example.org/proof/",
        href: `https://web.geolibre.app/?url=${encodeURIComponent("https://attacker.example/story.json")}`,
      }),
    ).toEqual({
      status: "failed",
      failure: "GeoLibre launch does not reference this publication companion",
    });
  });
});
