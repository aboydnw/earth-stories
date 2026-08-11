import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileProject } from "@earth-stories/publisher/compile";
import {
  defaultSourceProvenance,
  storyProjectSchema,
} from "@earth-stories/story-schema";
import { resolvePreviewManifest } from "./resolvePreviewManifest";

const fixturePath = join(process.cwd(), "fixtures/field-notes/story.json");

describe("resolvePreviewManifest", () => {
  it("resolves included project assets without mutating compiler output", async () => {
    const project = storyProjectSchema.parse(
      JSON.parse(await readFile(fixturePath, "utf8")) as unknown,
    );
    const compiled = compileProject(project);
    const originalHref = compiled.assets[0]?.href;

    const resolved = resolvePreviewManifest(project, compiled);

    expect(resolved.assets[0]?.href).toBe(
      "/api/projects/field-notes/assets/data/survey-sites.geojson",
    );
    expect(compiled.assets[0]?.href).toBe(originalHref);
  });

  it("keeps absolute included paths and direct-store connected URLs intact", async () => {
    const project = storyProjectSchema.parse(
      JSON.parse(await readFile(fixturePath, "utf8")) as unknown,
    );
    const survey = project.sources.find(({ id }) => id === "survey-sites");
    if (!survey || survey.kind !== "local-geojson")
      throw new Error("Fixture local source is missing");
    survey.path = "https://example.org/survey.geojson";
    project.sources.push({
      id: "time",
      kind: "zarr",
      label: "Time",
      locator: "https://example.org/time.zarr",
      variable: "data",
      selection: {},
      timeDimension: "time",
      timesteps: [{ label: "Now", index: 0 }],
      geozarr: null,
      delivery: "connected",
      attribution: null,
      sizeBytes: null,
      provenance: defaultSourceProvenance,
    });
    project.sources.push({
      id: "rain",
      kind: "cog",
      label: "Rain",
      locator: "https://example.org/rain.tif",
      delivery: "connected",
      attribution: null,
      sizeBytes: null,
      provenance: defaultSourceProvenance,
    });

    const resolved = resolvePreviewManifest(project, compileProject(project));

    expect(resolved.assets.find(({ id }) => id === "survey-sites")?.href).toBe(
      "https://example.org/survey.geojson",
    );
    expect(resolved.assets.find(({ id }) => id === "time")?.href).toBe(
      "https://example.org/time.zarr",
    );
    expect(resolved.assets.find(({ id }) => id === "rain")?.href).toBe(
      "/api/projects/field-notes/sources/rain/content",
    );
  });

  it("rejects traversal segments in included source paths", async () => {
    const project = storyProjectSchema.parse(
      JSON.parse(await readFile(fixturePath, "utf8")) as unknown,
    );
    const survey = project.sources.find(({ id }) => id === "survey-sites");
    if (!survey || survey.kind !== "local-geojson")
      throw new Error("Fixture local source is missing");
    survey.path = "../private.geojson";

    expect(() =>
      resolvePreviewManifest(project, compileProject(project)),
    ).toThrow(/path traversal/i);
  });
});
