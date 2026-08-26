import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { parseStoryProject } from "@earth-stories/story-schema";
import { buildTools } from "./tools.js";
import type { ServiceClient } from "./client.js";

async function fixtureProject() {
  return parseStoryProject(
    JSON.parse(
      await readFile(
        new URL("../../../fixtures/field-notes/story.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}

function toolNamed(client: ServiceClient, name: string) {
  const tool = buildTools(client).find((item) => item.name === name);
  if (!tool) throw new Error(`No tool named ${name}`);
  return tool;
}

describe("buildTools", () => {
  it("appends a validated chapter and saves the whole project", async () => {
    const project = await fixtureProject();
    const saveProject = vi.fn(async (value) => value);
    const client = {
      readProject: async () => project,
      saveProject,
    } as unknown as ServiceClient;

    const text = await toolNamed(client, "add_chapter").run({
      projectId: project.id,
      chapter: {
        id: "new-chapter",
        type: "prose",
        title: "Hello",
        narrative: "Body",
      },
    });

    expect(saveProject).toHaveBeenCalledOnce();
    const saved = saveProject.mock.calls[0]![0] as typeof project;
    expect(saved.chapters.at(-1)?.id).toBe("new-chapter");
    expect(saved.chapters).toHaveLength(project.chapters.length + 1);
    expect(text).toContain("Hello");
  });

  it("rejects an invalid chapter before touching the project", async () => {
    const saveProject = vi.fn();
    const readProject = vi.fn();
    const client = { readProject, saveProject } as unknown as ServiceClient;

    await expect(
      toolNamed(client, "add_chapter").run({
        projectId: "p1",
        chapter: { id: "broken", type: "prose" },
      }),
    ).rejects.toThrow();
    expect(readProject).not.toHaveBeenCalled();
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("rejects an invalid project before saving", async () => {
    const saveProject = vi.fn();
    const client = { saveProject } as unknown as ServiceClient;

    await expect(
      toolNamed(client, "update_project").run({ project: { id: "x" } }),
    ).rejects.toThrow();
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("adds an example connection as a connected source", async () => {
    const project = await fixtureProject();
    const saveProject = vi.fn(async (value) => value);
    const client = {
      readProject: async () => project,
      saveProject,
      listExamples: async () => ({
        stories: [],
        connections: [
          {
            id: "imerg",
            title: "IMERG precipitation",
            description: "Global rainfall",
            kind: "zarr",
            locator: "https://example.test/imerg.zarr",
            attribution: "NASA",
            config: { variable: "precipitation", timeDimension: "time" },
            camera: { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 },
          },
        ],
      }),
    } as unknown as ServiceClient;

    const text = await toolNamed(client, "add_example_connection").run({
      projectId: project.id,
      connectionId: "imerg",
    });

    const saved = saveProject.mock.calls[0]![0] as typeof project;
    const added = saved.sources.at(-1)!;
    expect(added.kind).toBe("zarr");
    expect(added.delivery).toBe("connected");
    expect(text).toContain(added.id);
  });

  it("names the unknown connection instead of saving", async () => {
    const saveProject = vi.fn();
    const client = {
      saveProject,
      listExamples: async () => ({ stories: [], connections: [] }),
    } as unknown as ServiceClient;

    await expect(
      toolNamed(client, "add_example_connection").run({
        projectId: "p1",
        connectionId: "missing",
      }),
    ).rejects.toThrow("missing");
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("starts a prepare conversion for an imported file", async () => {
    const startConversion = vi.fn(async () => ({ id: "job-1" }));
    const client = { startConversion } as unknown as ServiceClient;

    const text = await toolNamed(client, "prepare_data").run({
      projectId: "p1",
      assetPath: "data/dem.tif",
      capability: "raster",
    });

    expect(startConversion).toHaveBeenCalledWith("p1", {
      operation: "prepare",
      capability: "raster",
      assetPath: "data/dem.tif",
      options: undefined,
    });
    expect(text).toContain("job-1");
  });
});
