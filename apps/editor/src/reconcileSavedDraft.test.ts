import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ProjectStore } from "@earth-stories/project-store";
import { reconcileSavedDraft } from "./reconcileSavedDraft";
it("preserves edits made during saving and permits the next save", async () => {
  const directory = await mkdtemp(join(tmpdir(), "earth-draft-test-"));
  try {
    const store = new ProjectStore(directory);
    const submitted = await store.create({ title: "River" });
    const saving = store.save(submitted.id, submitted);
    const edited = {
      ...submitted,
      metadata: { ...submitted.metadata, title: "River revised" },
    };
    const saved = await saving;
    const draft = reconcileSavedDraft(edited, submitted, saved)!;
    expect(draft.metadata.title).toBe("River revised");
    await store.save(draft.id, draft);
    expect((await store.read(draft.id)).metadata.title).toBe("River revised");
    expect(reconcileSavedDraft(null, submitted, saved)).toBeNull();
    const different = { ...edited, id: "other" };
    expect(reconcileSavedDraft(different, submitted, saved)).toBe(different);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
