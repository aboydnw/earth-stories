import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectStore } from "@earth-stories/project-store";
import type { ConversionRuntime } from "./conversion-runtime.js";
import { ConversionJobs } from "./conversion-jobs.js";

describe("ConversionJobs", () => {
  it("resolves project-owned paths and ignores caller output paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-stories-jobs-"));
    const store = new ProjectStore(root);
    await store.initialize();
    const project = await store.create({ title: "Conversions" });
    const assets = join(store.projectPath(project.id), "assets");
    await mkdir(assets, { recursive: true });
    await writeFile(join(assets, "places.geojson"), "{}");
    let received: unknown;
    const runtime = {
      execute: async (request: unknown) => {
        received = request;
      },
    } as unknown as ConversionRuntime;
    const jobs = new ConversionJobs(store, runtime);

    const job = await jobs.create(project.id, {
      operation: "prepare",
      capability: "vector",
      assetPath: "assets/places.geojson",
      options: { target: "pmtiles", outputPath: "/tmp/escape" },
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 0));

    expect(received).toMatchObject({
      input: { path: join(assets, "places.geojson") },
      options: { outputPath: join(assets, "prepared/places.pmtiles") },
    });
    expect(jobs.get(job.id)?.status).toBe("succeeded");
  });
});
