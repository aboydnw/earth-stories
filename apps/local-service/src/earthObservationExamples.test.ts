import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
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

// These assets are RGBA8 PNGs. Check every chunk CRC and decompress every scanline,
// rather than accepting a file whose extension and byte count merely look right.
function decodeBundledPng(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  let offset = 8;
  let width = 0;
  let height = 0;
  let ended = false;
  const data: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    expect(end).toBeLessThanOrEqual(buffer.length);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let crc = 0xffffffff;
    for (const byte of buffer.subarray(offset + 4, end - 4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    expect((crc ^ 0xffffffff) >>> 0).toBe(buffer.readUInt32BE(end - 4));
    if (offset === 8) expect(type).toBe("IHDR");
    if (type === "IHDR") {
      expect(length).toBe(13);
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
      expect([...buffer.subarray(offset + 16, offset + 21)]).toEqual([
        8, 6, 0, 0, 0,
      ]);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(width * height).toBeLessThan(4_000_000);
    }
    if (type === "IDAT") data.push(buffer.subarray(offset + 8, end - 4));
    offset = end;
    if (type === "IEND") {
      expect(length).toBe(0);
      ended = true;
      break;
    }
  }
  expect(ended).toBe(true);
  expect(offset).toBe(buffer.length);
  const pixels = inflateSync(Buffer.concat(data), {
    maxOutputLength: height * (width * 4 + 1),
  });
  expect(pixels.length).toBe(height * (width * 4 + 1));
  for (let row = 0; row < height; row++)
    expect(pixels[row * (width * 4 + 1)]).toBeLessThanOrEqual(4);
}

describe("Earth observation stories", () => {
  it("registers three editable, compiling stories with bundled visual assets", async () => {
    for (const template of earthObservationStories) {
      const story = storyProjectSchema.parse(template);
      expect(story.metadata.author).toBeNull();
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
  it("decodes all bundled PNGs and rejects corrupt or truncated bytes", async () => {
    for (const story of earthObservationStories) {
      for (const file of await loadExampleAssetFiles(story.id)) {
        if (!file.path.endsWith(".png")) continue;
        decodeBundledPng(file.contents);
        expect(() => decodeBundledPng(file.contents.subarray(0, 40))).toThrow();
        const corrupt = Buffer.from(file.contents);
        corrupt[30] ^= 1;
        expect(() => decodeBundledPng(corrupt)).toThrow();
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
    const evidence = JSON.parse(
      Buffer.from(
        assets.find((f) => f.path.endsWith("kronebreen-evidence.json"))!
          .contents,
      ).toString("utf8"),
    );
    expect(evidence.rgiId).toBe("RGI60-07.01464");
    for (const [name, digest] of Object.entries(evidence.sha256)) {
      const asset = assets.find((f) => f.path === `assets/${name}`)!;
      expect(createHash("sha256").update(asset.contents).digest("hex")).toBe(
        digest,
      );
    }
    const months = new Set<string>(evidence.frontMonths);
    expect(months.size).toBe(evidence.frontMonths.length);
    expect(months.has("2015-01")).toBe(true); // reference geometry, no ablation interval
    for (const row of data) expect(months.has(row[0])).toBe(row[3] === "0");
    const missing = data.filter((row) => row[3] === "1").length;
    expect(months.size).toBe(data.length + 1 - missing);
    const outlines = edgeOfIce.chapters.find((c) => c.id === "edge-outlines")!;
    expect(outlines.narrative).toContain(
      `the ${months.size} available monthly fronts`,
    );
    expect(outlines.narrative).toContain(
      `The ${missing} absent months stay absent`,
    );
    expect(
      edgeOfIce.chapters.find((c) => c.id === "edge-gaps")!.narrative,
    ).toContain(`${data.length} monthly intervals`);
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
  it("provides textual keys without requiring readers to decode raster labels", () => {
    const fronts = edgeOfIce.chapters.find(
      (c) => c.id === "edge-outlines",
    )!.narrative;
    const record = edgeOfIce.chapters.find(
      (c) => c.id === "edge-record",
    )!.narrative;
    for (const label of [
      "**Gold:** January 2015",
      "**White:** December 2024",
      "easting in kilometres",
      "northing in kilometres",
    ])
      expect(fronts).toContain(label);
    for (const label of [
      "**Teal circles:**",
      "**Amber diamonds:**",
      "**Vertical bars:**",
      "**Coverage strip:**",
      "not confidence intervals",
      "separate flags",
    ])
      expect(record).toContain(label);
    expect(record).toContain("does not yet provide an interactive data table");
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
      expect(image.type === "image" && image.caption).toBe(
        story === beyondTreeCover
          ? "Conceptual key only. Equal panels are a layout choice, not a distribution of forest types."
          : "Original conceptual illustration. Panel sizes and positions do not encode observed fractions or sub-pixel geography.",
      );
      for (const source of story.sources) {
        expect(source.provenance.sourceUrl).toBe(
          "https://github.com/aboydnw/earth-stories",
        );
        expect(source.provenance.licenseName).toBe("MIT");
        expect(source.provenance.licenseUrl).toBe(
          "https://github.com/aboydnw/earth-stories/blob/main/LICENSE",
        );
      }
    }
  });
});
