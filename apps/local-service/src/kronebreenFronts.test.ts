import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("./example-assets/example-edge-of-ice/", import.meta.url);
const asset = (name: string) => readFile(new URL(name, root));
type Front = {
  id: string;
  properties: {
    month: string;
    year: number;
    monthNumber: number;
    rgiId: string;
    dateRole: string;
  };
  geometry: { type: string; coordinates: number[][][] };
};

describe("Kronebreen geographic front evidence", () => {
  it("preserves all 114 source-derived fronts in longitude/latitude without inventing missing months", async () => {
    const bytes = await asset("kronebreen-fronts.geojson");
    const geojson = JSON.parse(bytes.toString());
    const evidence = JSON.parse(
      (await asset("kronebreen-evidence.json")).toString(),
    );
    const fronts: Front[] = geojson.features;
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.crs).toBeUndefined(); // RFC 7946 geographic coordinates
    expect(fronts).toHaveLength(114);
    expect(fronts.map((front) => front.properties.month)).toEqual(
      evidence.frontMonths,
    );
    expect(new Set(fronts.map((front) => front.id)).size).toBe(114);
    expect(fronts[0]!.properties).toMatchObject({
      month: "2015-01",
      dateRole: "first",
    });
    expect(fronts.at(-1)!.properties).toMatchObject({
      month: "2024-12",
      dateRole: "latest",
    });
    for (const front of fronts) {
      expect(front.properties.rgiId).toBe("RGI60-07.01464");
      expect(front.properties.month).toBe(
        `${front.properties.year}-${String(front.properties.monthNumber).padStart(2, "0")}`,
      );
      expect(front.geometry.type).toBe("MultiLineString");
      expect(front.geometry.coordinates.length).toBeGreaterThan(0);
      for (const line of front.geometry.coordinates) {
        expect(line.length).toBeGreaterThanOrEqual(2);
        for (const [longitude, latitude] of line) {
          expect(longitude).toBeGreaterThan(11);
          expect(longitude).toBeLessThan(14);
          expect(latitude).toBeGreaterThan(78);
          expect(latitude).toBeLessThan(80);
        }
      }
    }
    expect(evidence.frontGeometry).toMatchObject({
      sourceCrs: "EPSG:32633",
      outputCrs: "EPSG:4326",
      interpolation: false,
      simplification: false,
      md5: "830e473af026b99bd9daaf3efbf8be69",
    });
    expect(evidence.frontGeometry.missingMonths).toHaveLength(6);
    for (const month of evidence.frontGeometry.missingMonths) {
      expect(evidence.frontMonths).not.toContain(month);
    }
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      evidence.sha256["kronebreen-fronts.geojson"],
    );
    expect(bytes.byteLength).toBeLessThan(3_000_000);
  });
});
