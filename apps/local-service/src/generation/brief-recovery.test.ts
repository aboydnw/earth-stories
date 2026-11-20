import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { ProjectStore } from "@earth-stories/project-store";
import { GenerationJobs } from "./jobs.js";
import type {
  GenerationProvider,
  StoryBrief,
} from "@earth-stories/story-schema";
vi.mock("./reference-inputs.js", () => ({ prepareReferences: async () => [] }));

it("restores original references after failure and service restart without changing the old job", async () => {
  const root = await mkdtemp(join(tmpdir(), "earth-brief-recovery-"));
  try {
    const provider: GenerationProvider = {
      configured: true,
      plan: async () => {
        throw new Error("Reference could not be used");
      },
    };
    const jobs = new GenerationJobs(new ProjectStore(root), provider);
    await jobs.initialize();
    const brief: StoryBrief = {
      title: "Birds",
      audience: "Everyone",
      takeaway: "Notice eggs",
      narrative: "Original",
      visualDirection: "Soft colors",
      requestedOutputs: ["prose"],
      references: [
        {
          kind: "url",
          name: "Style",
          classification: "visual-style",
          url: "https://example.org/",
        },
        {
          kind: "upload",
          name: "notes.txt",
          classification: "facts",
          mediaType: "text/plain",
          data: "aGVsbG8=",
        },
      ],
    };
    const created = await jobs.start(brief);
    await jobs.whenIdle();
    const before = await jobs.get(created.id);
    expect(before.stage).toBe("failed");
    expect(before.brief.references).toEqual([]);
    const reopened = new GenerationJobs(new ProjectStore(root), provider);
    await reopened.initialize();
    expect(await reopened.getBrief(created.id)).toEqual(brief);
    expect(await reopened.get(created.id)).toEqual(before);
    await expect(reopened.getBrief("../outside")).rejects.toThrow(
      "Invalid generation ID",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
