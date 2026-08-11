import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PUBLISH_RECORD_PATH,
  readPublishRecord,
  writePublishRecord,
} from "./publish-record.js";

const record = {
  owner: "mapper",
  repo: "field-notes",
  url: "https://mapper.github.io/field-notes/",
  branch: "gh-pages",
  buildId: "build-1",
  publishedAt: "2026-08-11T00:00:00.000Z",
};

const project = () => mkdtemp(join(tmpdir(), "earth-stories-record-"));

describe("publish record", () => {
  it("round-trips through the project's .earth-stories folder", async () => {
    const directory = await project();
    await writePublishRecord(directory, record);
    expect(await readPublishRecord(directory)).toEqual(record);
    expect(PUBLISH_RECORD_PATH).toBe(".earth-stories/publish.json");
  });

  it("returns null when the story was never published", async () => {
    expect(await readPublishRecord(await project())).toBeNull();
  });

  it("returns null for a damaged record rather than throwing", async () => {
    const directory = await project();
    await mkdir(join(directory, ".earth-stories"), { recursive: true });
    await writeFile(join(directory, PUBLISH_RECORD_PATH), "{ not json");
    expect(await readPublishRecord(directory)).toBeNull();
  });

  it("returns null when required fields are missing", async () => {
    const directory = await project();
    await mkdir(join(directory, ".earth-stories"), { recursive: true });
    await writeFile(
      join(directory, PUBLISH_RECORD_PATH),
      JSON.stringify({ owner: "mapper" }),
    );
    expect(await readPublishRecord(directory)).toBeNull();
  });
});
