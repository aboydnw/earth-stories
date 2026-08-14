import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkEstimatedSize,
  checkReleaseLimits,
  inspectRelease,
} from "./publish-limits.js";

describe("checkEstimatedSize", () => {
  it("passes an ordinary story without comment", () => {
    expect(checkEstimatedSize(40_000_000)).toEqual({
      blocked: false,
      message: null,
    });
  });

  it("blocks a story over the site limit", () => {
    const verdict = checkEstimatedSize(1_200_000_000);
    expect(verdict.blocked).toBe(true);
    expect(verdict.message).toMatch(/1 GB/);
  });

  it("warns without blocking as the limit approaches", () => {
    const verdict = checkEstimatedSize(850_000_000);
    expect(verdict.blocked).toBe(false);
    expect(verdict.message).toMatch(/close to/);
  });

  it("names the portable profile as the likely cause", () => {
    expect(checkEstimatedSize(1_200_000_000, "portable").message).toMatch(
      /portable profile/,
    );
    expect(checkEstimatedSize(1_200_000_000, "connected").message).not.toMatch(
      /portable profile/,
    );
  });
});

describe("inspectRelease", () => {
  it("totals every file and finds the largest, including nested ones", async () => {
    const directory = await mkdtemp(join(tmpdir(), "earth-stories-limits-"));
    await writeFile(join(directory, "index.html"), "a".repeat(100));
    await mkdir(join(directory, "assets"), { recursive: true });
    await writeFile(join(directory, "assets", "map.pmtiles"), "b".repeat(500));
    await mkdir(join(directory, ".git"), { recursive: true });
    await writeFile(join(directory, ".git", "ignored"), "c".repeat(1_000));
    const inspection = await inspectRelease(directory);
    expect(inspection.totalBytes).toBe(600);
    expect(inspection.largestFile).toEqual({
      path: "assets/map.pmtiles",
      bytes: 500,
    });
  });
});

describe("checkReleaseLimits", () => {
  it("blocks a single file over the per-file limit and names it", () => {
    const verdict = checkReleaseLimits({
      totalBytes: 200_000_000,
      largestFile: { path: "assets/elevation.tif", bytes: 150_000_000 },
    });
    expect(verdict.blocked).toBe(true);
    expect(verdict.message).toMatch(/assets\/elevation\.tif/);
    expect(verdict.message).toMatch(/100 MB/);
  });

  it("blocks a release over the site limit", () => {
    expect(
      checkReleaseLimits({ totalBytes: 1_100_000_000, largestFile: null })
        .blocked,
    ).toBe(true);
  });

  it("passes a release comfortably inside both limits", () => {
    expect(
      checkReleaseLimits({
        totalBytes: 20_000_000,
        largestFile: { path: "assets/map.pmtiles", bytes: 9_000_000 },
      }),
    ).toEqual({ blocked: false, message: null });
  });
});
