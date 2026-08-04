import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileProject } from "./compile.js";

const fixturePath = join(process.cwd(), "fixtures/field-notes/story.json");

describe("compileProject", () => {
  it("is deterministic and includes local assets", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
    const first = compileProject(fixture);
    const second = compileProject(fixture);

    expect(second).toEqual(first);
    expect(first.build.id).toBe(first.build.projectDigest.slice(0, 16));
    expect(first.assets).toContainEqual(
      expect.objectContaining({ id: "survey-sites", delivery: "included" }),
    );
    expect(first.externalDependencies).toContainEqual(
      expect.objectContaining({ resourceId: "carto-positron" }),
    );
  });

  it("compiles image, chart, scrolly, and connected asset policies", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as any;
    fixture.sources.push(
      {
        id: "photo",
        kind: "image",
        label: "River",
        path: "assets/river.jpg",
        attribution: null,
        sizeBytes: 12,
        delivery: "included",
      },
      {
        id: "values",
        kind: "csv",
        label: "Readings",
        path: "assets/readings.csv",
        attribution: null,
        sizeBytes: 20,
        delivery: "included",
      },
      {
        id: "rain",
        kind: "cog",
        label: "Rain",
        locator: "https://example.com/rain.tif",
        attribution: null,
        sizeBytes: null,
        delivery: "auto",
      },
    );
    fixture.chapters.push(
      {
        id: "image",
        type: "image",
        title: "River",
        narrative: "",
        sourceId: "photo",
        alt: "River",
        caption: "At dawn",
      },
      {
        id: "chart",
        type: "chart",
        title: "Readings",
        narrative: "",
        sourceId: "values",
        chartType: "bar",
        xColumn: "label",
        yColumn: "value",
      },
      {
        id: "scroll",
        type: "scrolly",
        title: "Rain",
        narrative: "",
        sourceId: "rain",
        camera: { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 },
      },
    );
    const result = compileProject(fixture);
    expect(result.chapters.map((chapter) => chapter.type)).toEqual(
      expect.arrayContaining(["image", "chart", "scrolly"]),
    );
    expect(result.assets.find((asset) => asset.id === "rain")?.delivery).toBe(
      "connected",
    );
    expect(
      result.externalDependencies.find((item) => item.resourceId === "rain")
        ?.requirements,
    ).toContain("byte-ranges");
  });

  it("rejects broken source references and incompatible delivery overrides", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as any;
    fixture.chapters.push({
      id: "broken",
      type: "image",
      title: "Broken",
      narrative: "",
      sourceId: "missing",
      alt: "",
      caption: "",
    });
    expect(() => compileProject(fixture)).toThrow("references missing source");
    fixture.chapters.pop();
    fixture.sources[0].delivery = "connected";
    expect(() => compileProject(fixture)).toThrow(
      "cannot use connected delivery",
    );
  });
});
