import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ProjectStore } from "@earth-stories/project-store";
import { enhancementContext } from "./enhancement-context.js";
it("includes normalized images and data extracts, but never reads a source escaping the story folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "earth-context-"));
  try {
    const store = new ProjectStore(root);
    let project = await store.create({ title: "Context" });
    const png = await createCanvas(4, 4).encode("png");
    await writeFile(store.assetPath(project.id, "photo.png"), png);
    await writeFile(
      store.assetPath(project.id, "table.csv"),
      "€".repeat(100001),
    );
    await writeFile(join(root, "outside.txt"), "DO NOT READ OUTSIDE PROJECT");
    await symlink(
      join(root, "outside.txt"),
      store.assetPath(project.id, "escape.csv"),
    );
    project = await store.save(project.id, {
      ...project,
      sources: [
        {
          id: "photo",
          kind: "image",
          label: "Photo",
          path: "photo.png",
          attribution: null,
        },
        {
          id: "table",
          kind: "csv",
          label: "Table",
          path: "table.csv",
          attribution: null,
        },
        {
          id: "escape",
          kind: "csv",
          label: "Outside reference",
          path: "escape.csv",
          attribution: null,
        },
      ],
    });
    const context = await enhancementContext(
      store,
      project.id,
      {},
      new AbortController().signal,
    );
    expect(
      context.references.find((r) => r.id === "story-source-photo")!.image,
    ).toMatch(/^data:image\/png;base64,/);
    expect(
      context.references.find((r) => r.id === "story-source-table")!.text,
    ).toBe("€".repeat(6666));
    expect(context.warnings.join(" ")).toContain("first 20,000 bytes");
    expect(JSON.stringify(context)).not.toContain(
      "DO NOT READ OUTSIDE PROJECT",
    );
    expect(context.warnings.join(" ")).toContain("Outside reference");
    expect(
      context.references.find((r) => r.id === "story-context-coverage")!.text,
    ).toContain("could not be inspected");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
