import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { storyProjectSchema } from "./project.js";

describe("storyProjectSchema", () => {
  it("accepts the representative project", async () => {
    const fixture = JSON.parse(
      await readFile(
        join(process.cwd(), "fixtures/field-notes/story.json"),
        "utf8",
      ),
    ) as unknown;
    expect(storyProjectSchema.parse(fixture).id).toBe("field-notes");
  });

  it("rejects hosted workspace-shaped data", async () => {
    const fixture = JSON.parse(
      await readFile(
        join(process.cwd(), "fixtures/field-notes/story.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(() =>
      storyProjectSchema.parse({
        ...fixture,
        workspace_id: "abcd1234",
        chapters: [],
      }),
    ).toThrow();
  });
});
