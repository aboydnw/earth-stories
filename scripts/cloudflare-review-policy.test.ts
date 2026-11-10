import { mkdtemp, open, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileProject } from "@earth-stories/publisher";
import { findExampleStory } from "../apps/local-service/src/examples.js";
import {
  assertCloudflareFiles,
  assertReviewManifest,
  CLOUDFLARE_FILE_LIMIT,
  requirePrivateReviewBuild,
} from "./cloudflare-review-policy.js";

const manifest = () => compileProject(findExampleStory("storm-track")!);

describe("private review deployment gate", () => {
  const env = {
    EARTH_STORIES_PRIVATE_REVIEW_ACCESS_VERIFIED: "true",
    EARTH_STORIES_REVIEW_BRANCH: "review-branch",
    CF_PAGES_BRANCH: "review-branch",
    CF_PAGES_COMMIT_SHA: "abc123",
  };
  it("defaults off and requires matching branch and commit", () => {
    expect(() => requirePrivateReviewBuild({}, "abc123")).toThrow("disabled");
    expect(() => requirePrivateReviewBuild(env, "abc123")).not.toThrow();
    expect(() => requirePrivateReviewBuild(env, "different")).toThrow(
      "disabled",
    );
    expect(() =>
      requirePrivateReviewBuild({ ...env, CF_PAGES_BRANCH: "main" }, "abc123"),
    ).toThrow("disabled");
    expect(() =>
      requirePrivateReviewBuild(
        { ...env, EARTH_STORIES_PRIVATE_REVIEW_ACCESS_VERIFIED: "false" },
        "abc123",
      ),
    ).toThrow("disabled");
  });
});

describe("Katrina review manifest", () => {
  it("accepts the canonical example with remote PMTiles", () => {
    const value = manifest();
    expect(
      value.assets.some(
        (asset) => asset.kind === "pmtiles" && asset.delivery === "connected",
      ),
    ).toBe(true);
    expect(value.publication.theme).toBe("atlas");
    expect(() => assertReviewManifest(value)).not.toThrow();
  });
  it("rejects runtime requirements and GeoParquet even with empty runtime inventory", () => {
    const value = manifest();
    value.runtimeAssets.push({
      id: "duckdb",
      href: "runtime/duckdb/test.wasm",
      sha256: "a".repeat(64),
    });
    expect(() => assertReviewManifest(value)).toThrow("cannot omit DuckDB");
    const source = manifest();
    source.assets[0]!.kind = "geoparquet";
    expect(() => assertReviewManifest(source)).toThrow("cannot omit DuckDB");
  });
  it("rejects local range requirements and included PMTiles independently", () => {
    const value = manifest();
    value.hostingRequirements.push("byte-ranges");
    expect(() => assertReviewManifest(value)).toThrow("byte-range");
    const source = manifest();
    source.assets.find((asset) => asset.kind === "pmtiles")!.delivery =
      "included";
    expect(() => assertReviewManifest(source)).toThrow("byte-range");
    const dependency = manifest();
    dependency.dependencies.push({
      id: "test-range",
      owner: { type: "source", id: "test" },
      locator: "test.pmtiles",
      estimatedBytes: 1,
      delivery: "included",
      materialization: "copy-local",
      requirements: ["byte-ranges"],
      sha256: "a".repeat(64),
    });
    expect(() => assertReviewManifest(dependency)).toThrow("byte-range");
  });
});

it("allows exactly 25 MiB, rejects one byte over and symlinks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "review-limit-"));
  try {
    const file = await open(join(directory, "asset.bin"), "w");
    try {
      await file.truncate(CLOUDFLARE_FILE_LIMIT);
      expect(await assertCloudflareFiles(directory)).toEqual([
        { path: "asset.bin", bytes: CLOUDFLARE_FILE_LIMIT },
      ]);
      await file.truncate(CLOUDFLARE_FILE_LIMIT + 1);
      await expect(assertCloudflareFiles(directory)).rejects.toThrow("25 MiB");
    } finally {
      await file.close();
    }
    await rm(join(directory, "asset.bin"));
    await symlink("missing", join(directory, "link"));
    await expect(assertCloudflareFiles(directory)).rejects.toThrow("Symlink");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
