import { describe, expect, it } from "vitest";
import type { PublicationManifest } from "@earth-stories/story-schema";
import {
  chapterDependencyLocators,
  publicationRuntimePolicy,
} from "./publicationRuntime.js";

const dependency = (
  id: string,
  locator: string,
): PublicationManifest["dependencies"][number] => ({
  id,
  owner: { type: "chapter", id: "map" },
  locator,
  estimatedBytes: null,
  delivery: "connected",
  materialization: "none",
  requirements: ["network"],
});

describe("publication runtime policy", () => {
  it("derives optional terrain and building locators from declared chapter dependencies", () => {
    expect(
      chapterDependencyLocators("map", [
        dependency("chapter:map:terrain", "https://tiles.test/terrain/{z}"),
        dependency("chapter:map:buildings", "https://tiles.test/buildings"),
      ]),
    ).toEqual({
      terrain: "https://tiles.test/terrain/{z}",
      buildings: "https://tiles.test/buildings",
    });
    expect(chapterDependencyLocators("other", [])).toEqual({});
  });

  it("preserves manifest runtime and projection catalogs in offline policy", () => {
    const runtimeAssets = [
      {
        id: "runtime:duckdb:duckdb-mvp.wasm",
        href: "runtime/mvp.wasm",
        sha256: "a".repeat(64),
      },
    ];
    const projectionDefinitions = [
      { epsg: 32618, definition: "+proj=utm +zone=18" },
    ];
    expect(
      publicationRuntimePolicy({
        publication: { profile: "offline", theme: "cng" },
        connectivity: { requested: "offline", state: "pending" },
        dependencies: [],
        runtimeAssets,
        projectionDefinitions,
      }),
    ).toEqual({
      offline: true,
      runtimeAssets,
      projectionDefinitions,
      dependencies: [],
    });
  });
});
