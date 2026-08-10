import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  storyProjectSchema,
  type StoryProject,
} from "@earth-stories/story-schema";
import { deriveAuthoringReadiness } from "./readiness.js";

async function fixture(): Promise<StoryProject> {
  return storyProjectSchema.parse(
    JSON.parse(
      await readFile(
        join(process.cwd(), "fixtures/field-notes/story.json"),
        "utf8",
      ),
    ),
  );
}

describe("deriveAuthoringReadiness", () => {
  it("treats data as optional for prose-only stories", async () => {
    const project = await fixture();
    project.sources = [];
    project.chapters = [
      {
        id: "intro",
        type: "prose",
        title: "Introduction",
        narrative: "Hello.",
      },
    ];
    const result = deriveAuthoringReadiness(project);
    expect(result.manifest).not.toBeNull();
    expect(result.stages.data).toBe("optional");
    expect(
      result.findings.some(
        ({ area, severity }) => area === "data" && severity === "error",
      ),
    ).toBe(false);
  });

  it("reports stable blockers for broken source references", async () => {
    const project = await fixture();
    const chapter = project.chapters.find(
      (candidate) => candidate.type === "map",
    )!;
    if (chapter.type === "map") chapter.sourceId = "missing";
    const result = deriveAuthoringReadiness(project);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: `chapter-source-${chapter.id}-missing`,
        area: "data",
        severity: "error",
      }),
    );
    expect(result.findings.filter(({ id }) => id === "compile")).toHaveLength(
      1,
    );
    expect(result.stages.publish).toBe("blocked");
  });

  it("keeps provenance omissions and stale data warning-only", async () => {
    const project = await fixture();
    project.sources[0]!.provenance = {
      ...project.sources[0]!.provenance,
      dataUpdatedAt: "2026-01-01",
      staleAfterDays: 30,
    };
    const result = deriveAuthoringReadiness(project, {
      now: new Date("2026-08-08T00:00:00Z"),
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: `provenance-stale-${project.sources[0]!.id}`,
        severity: "warning",
      }),
    );
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id.startsWith("provenance-") && severity === "error",
      ),
    ).toBe(false);
    expect(result.manifest).not.toBeNull();
  });

  it("warns when a shared link would have no summary", async () => {
    const project = await fixture();
    project.metadata.description = "";
    for (const chapter of project.chapters) chapter.narrative = "";
    const result = deriveAuthoringReadiness(project);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: "share-description",
        area: "sharing",
        severity: "warning",
      }),
    );
    expect(result.stages.sharing).toBe("current");
  });

  it("stays quiet about sharing when a chapter narrative can stand in", async () => {
    const project = await fixture();
    project.metadata.description = "";
    const result = deriveAuthoringReadiness(project);
    expect(result.findings.some(({ area }) => area === "sharing")).toBe(false);
    expect(result.stages.sharing).toBe("complete");
  });

  it("catches a compiler failure once", async () => {
    const project = await fixture();
    const source = project.sources[0]!;
    project.sources = [
      {
        id: source.id,
        kind: "image",
        label: "Wrong kind",
        path: "data/survey-sites.geojson",
        attribution: null,
        provenance: source.provenance,
        sizeBytes: null,
        delivery: "included",
      },
    ];
    const result = deriveAuthoringReadiness(project);
    expect(result.manifest).toBeNull();
    expect(result.findings.filter(({ id }) => id === "compile")).toHaveLength(
      1,
    );
  });
});
