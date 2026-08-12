import { describe, expect, it } from "vitest";
import type { ReadinessFinding } from "@earth-stories/publisher/readiness";
import type { StoryProject } from "@earth-stories/story-schema";
import { deriveChapterReadiness } from "./chapterReadiness";
import { nextGuidanceAction } from "./editorReadiness";

const project = {
  chapters: [
    { id: "prose", type: "prose", title: "", narrative: "" },
    {
      id: "image",
      type: "image",
      title: "Image",
      narrative: "",
      sourceId: "photo",
      alt: "",
      caption: "",
    },
    {
      id: "chart",
      type: "chart",
      title: "Chart",
      narrative: "Data",
      sourceId: "table",
      chartType: "bar",
      xColumn: "",
      yColumn: "",
    },
    {
      id: "map",
      type: "map",
      title: "Map",
      narrative: "Map copy",
      sourceId: "geo",
      overlaySourceIds: ["bad"],
      camera: { center: [0, 20], zoom: 1.5, bearing: 0, pitch: 0 },
    },
  ],
  sources: [],
} as unknown as StoryProject;

const finding = (
  value: Partial<ReadinessFinding> & Pick<ReadinessFinding, "id">,
): ReadinessFinding => ({
  area: "chapters",
  severity: "warning",
  message: value.id,
  ...value,
});

describe("deriveChapterReadiness", () => {
  it("uses stable task priority and maps shared resource findings", () => {
    const states = deriveChapterReadiness(project, [
      finding({ id: "chapter-narrative-prose", chapterId: "prose" }),
      finding({
        id: "chapter-title-prose",
        chapterId: "prose",
        severity: "error",
      }),
      finding({ id: "image-alt-image", chapterId: "image" }),
      finding({
        id: "chapter-fields-chart",
        chapterId: "chart",
        severity: "error",
      }),
      finding({
        id: "source-publication-bad",
        area: "data",
        resourceId: "bad",
        severity: "error",
      }),
    ]);
    expect(states.prose?.label).toBe("Add title");
    expect(states.image?.label).toBe("Add alternative text");
    expect(states.chart?.label).toBe("Configure chart axes");
    expect(states.map?.label).toBe("Fix source settings");
  });

  it("returns Ready when no finding applies", () => {
    expect(deriveChapterReadiness(project, []).prose).toEqual({
      tone: "ready",
      label: "Ready",
      findings: [],
    });
  });

  it("uses the same highest-priority finding as next-action guidance", () => {
    const findings = [
      finding({
        id: "chapter-title-map",
        chapterId: "map",
        severity: "error",
      }),
      finding({
        id: "chapter-source-map-missing",
        area: "data",
        chapterId: "map",
        resourceId: "missing",
        severity: "error",
      }),
    ];
    const rail = deriveChapterReadiness(project, findings).map!;
    const guidance = nextGuidanceAction({
      readiness: {
        manifest: null,
        findings,
        stages: {
          story: "complete",
          chapters: "current",
          data: "blocked",
          preview: "blocked",
          publish: "blocked",
          sharing: "blocked",
        },
      },
      activeChapterId: "map",
      saveState: "saved",
      previewReviewed: false,
      preflight: { status: "idle", result: null, error: null, key: null },
    });
    expect(rail.findings[0]?.id).toBe("chapter-source-map-missing");
    expect(guidance.id).toBe(rail.findings[0]?.id);
  });

  it("keeps source-scoped rail findings and guidance on the same source", () => {
    const findings = [
      finding({
        id: "source-publication-bad",
        area: "data",
        resourceId: "bad",
        severity: "error",
      }),
    ];
    const rail = deriveChapterReadiness(project, findings).map!;
    const guidance = nextGuidanceAction({
      readiness: {
        manifest: null,
        findings,
        stages: {
          story: "complete",
          chapters: "current",
          data: "blocked",
          preview: "blocked",
          publish: "blocked",
          sharing: "blocked",
        },
      },
      activeChapterId: "map",
      activeChapterSourceIds: ["geo", "bad"],
      saveState: "saved",
      previewReviewed: false,
      preflight: { status: "idle", result: null, error: null, key: null },
    });
    expect(rail.findings[0]?.id).toBe(guidance.id);
    expect(guidance).toMatchObject({
      destination: "data",
      resourceId: "bad",
    });
  });
});
