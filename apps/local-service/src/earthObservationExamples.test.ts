import { describe, expect, it } from "vitest";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { compileProject } from "@earth-stories/publisher";
import {
  earthObservationStories,
  edgeOfIce,
  beyondTreeCover,
  aPlaceRewritten,
} from "./earthObservationExamples.js";
import { loadExampleAssetFiles } from "./exampleAssets.js";
import { findExampleStory } from "./examples.js";

describe("Earth observation stories", () => {
  it("registers three editable, compiling stories with bundled visual assets", async () => {
    for (const template of earthObservationStories) {
      const story = storyProjectSchema.parse(template);
      expect(findExampleStory(story.id.replace("example-", ""))).toBe(template);
      expect(compileProject(story).chapters).toHaveLength(
        story.chapters.length,
      );
      const files = await loadExampleAssetFiles(story.id);
      for (const source of story.sources) {
        expect(source.delivery).toBe("included");
        expect(source.provenance.sourceUrl).toMatch(/^https:/);
        if (source.kind === "image" || source.kind === "csv") {
          expect(
            files.find((f) => f.path === source.path)?.contents.byteLength,
          ).toBeGreaterThan(100);
        }
      }
    }
  });
  it("preserves Kronebreen interval coverage, uncertainty and distinct flags", async () => {
    const assets = await loadExampleAssetFiles(edgeOfIce.id);
    const csv = assets.find((f) => f.path.endsWith(".csv"))!;
    const rows = Buffer.from(csv.contents)
      .toString("utf8")
      .trim()
      .split(/\r?\n/);
    expect(rows[0]).toBe(
      "month,frontal_ablation_gt_per_year,uncertainty_gt_per_year,geometry_missing,area_change_interpolated",
    );
    const data = rows.slice(1).map((row) => row.split(","));
    expect(data).toHaveLength(119);
    expect(data[0][0]).toBe("2015-02");
    expect(data.at(-1)![0]).toBe("2024-12");
    expect(data.filter((row) => row[3] === "1")).toHaveLength(6);
    expect(data.filter((row) => row[4] === "1")).toHaveLength(8);
    expect(data.some((row) => row[3] === "0" && row[4] === "1")).toBe(true);
    expect(
      edgeOfIce.chapters
        .map((c) => c.narrative + (c.type === "image" ? c.caption : ""))
        .join(" "),
    ).toContain("not monthly totals");
  });
  it("does not present editorial prototypes as connected observations", () => {
    for (const story of [beyondTreeCover, aPlaceRewritten]) {
      expect(story.metadata.title).toContain("editorial prototype");
      expect(story.chapters[0].narrative).toContain("Editorial prototype");
      expect(story.sources.every((source) => source.kind === "image")).toBe(
        true,
      );
      expect(
        story.chapters.some(
          (c) => c.type === "map" || c.type === "chart" || c.type === "scrolly",
        ),
      ).toBe(false);
      const image = story.chapters.find((c) => c.type === "image")!;
      expect(image.type === "image" && image.caption).toMatch(/not|do not/);
    }
  });
});
