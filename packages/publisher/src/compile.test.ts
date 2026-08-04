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
});
