import { describe, expect, it } from "vitest";
import { evaluateInstalledApp } from "./verify-installed-app.mjs";

describe("evaluateInstalledApp", () => {
  it("records a passing installed-app privacy boundary", () => {
    const evidence = evaluateInstalledApp({
      artifactPath: "/tmp/Earth Stories.app",
      platform: "darwin",
      architecture: "arm64",
      checkedAt: "2026-10-28T12:00:00.000Z",
      resources: ["editor/index.html", "viewer/index.html", "credits/THIRD_PARTY_NOTICES.md"],
      publicationText:
        '{"href":"https://example.org/story/assets/sites.geojson"}',
      privatePaths: ["/Users/tester/Documents/private/source.geojson"],
      geoLibreExternalOpened: true,
      serviceStopped: true,
    });

    expect(evidence.failures).toEqual([]);
    expect(evidence.artifact).toBe("Earth Stories.app");
    expect(JSON.stringify(evidence)).not.toContain("/Users/tester");
  });

  it("fails closed on missing resources, leaked paths, navigation, and shutdown", () => {
    const evidence = evaluateInstalledApp({
      artifactPath: "/tmp/linux-unpacked",
      platform: "linux",
      architecture: "x64",
      checkedAt: "2026-10-28T12:00:00.000Z",
      resources: ["editor/index.html"],
      publicationText: "/home/tester/private/source.geojson?token=secret",
      privatePaths: ["/home/tester/private/source.geojson"],
      geoLibreExternalOpened: false,
      serviceStopped: false,
    });

    expect(evidence.failures).toEqual([
      "missing-resource:viewer/index.html",
      "missing-resource:credits/THIRD_PARTY_NOTICES.md",
      "publication-leaks-private-path",
      "geolibre-external-navigation-not-observed",
      "embedded-service-did-not-stop",
    ]);
    expect(JSON.stringify(evidence)).not.toContain("secret");
    expect(JSON.stringify(evidence)).not.toContain("/home/tester");
  });
});
