import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  projectSourceSchema,
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
      0,
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

  it("keeps a newly created placeholder video blocked until a real URL is entered", async () => {
    const project = await fixture();
    project.chapters = [
      {
        id: "video",
        type: "video",
        title: "Video",
        narrative: "Context",
        provider: "youtube",
        videoId: "VIDEO_ID",
        originalUrl: "https://www.youtube.com/watch?v=VIDEO_ID",
      },
    ];
    expect(deriveAuthoringReadiness(project).findings).toContainEqual(
      expect.objectContaining({
        id: "chapter-fields-video",
        severity: "error",
      }),
    );
  });

  it("stays quiet about sharing when a chapter narrative can stand in", async () => {
    const project = await fixture();
    project.metadata.description = "";
    const result = deriveAuthoringReadiness(project);
    expect(result.findings.some(({ area }) => area === "sharing")).toBe(false);
    expect(result.stages.sharing).toBe("complete");
  });

  it("attributes incompatible chapter sources without a generic compile error", async () => {
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
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: "chapter-source-kind-sites",
        chapterId: "sites",
        resourceId: source.id,
      }),
    );
    expect(result.findings.filter(({ id }) => id === "compile")).toHaveLength(
      0,
    );
  });

  it("attributes deterministic delivery and remote URL failures to sources", async () => {
    const project = await fixture();
    project.sources[0]!.delivery = "connected";
    const local = deriveAuthoringReadiness(project);
    expect(local.findings).toContainEqual(
      expect.objectContaining({
        id: "source-publication-survey-sites",
        area: "data",
        severity: "error",
        resourceId: "survey-sites",
      }),
    );
    expect(local.findings.some(({ id }) => id === "compile")).toBe(false);

    project.sources[0] = projectSourceSchema.parse({
      id: "survey-sites",
      kind: "cog",
      label: "Survey sites",
      locator: "https://localhost/private.tif",
      delivery: "connected",
      provenance: project.sources[0]!.provenance,
    });
    const remote = deriveAuthoringReadiness(project);
    expect(remote.findings).toContainEqual(
      expect.objectContaining({
        id: "source-publication-survey-sites",
        resourceId: "survey-sites",
        message: "Remote assets cannot use private or local network hosts.",
      }),
    );
    expect(remote.findings.some(({ id }) => id === "compile")).toBe(false);
  });

  it("keeps the generic compile finding for unexpected invalid project state", async () => {
    const project = await fixture();
    project.publication.theme =
      "unknown" as StoryProject["publication"]["theme"];
    const result = deriveAuthoringReadiness(project);
    expect(result.findings.filter(({ id }) => id === "compile")).toHaveLength(
      1,
    );
  });
});
