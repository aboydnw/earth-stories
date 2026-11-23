// @vitest-environment jsdom
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { ProjectStore } from "@earth-stories/project-store";
import {
  visualAccentSchema,
  visualSequenceSchema,
  type StoryProject,
  type VisualSequence,
} from "@earth-stories/story-schema";
import { App } from "./App";

const api = vi.hoisted(() => ({
  openProject: vi.fn(),
  listProjects: vi.fn(),
  saveProject: vi.fn(),
  getExamples: vi.fn(),
}));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  ...api,
}));
// Exercise the App callback boundary: the current inspector does not expose
// step extension, but any caller must preserve existing companion artwork.
vi.mock("./VisualSequenceInspector", () => ({
  VisualSequenceInspector: ({
    sequence,
    onChange,
  }: {
    sequence: VisualSequence;
    onChange: (next: VisualSequence) => void;
  }) => (
    <>
      <button
        onClick={() =>
          onChange({
            ...sequence,
            steps: [
              { chapterId: "opening", start: 0, end: 0.5 },
              { chapterId: "ending", start: 0.5, end: 1 },
            ],
          })
        }
      >
        Extend scene over companion artwork
      </button>
      <button
        onClick={() => onChange({ ...sequence, caption: "Updated caption" })}
      >
        Update scene caption
      </button>
    </>
  ),
}));

let directory: string | undefined;
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  if (directory) await rm(directory, { recursive: true, force: true });
});

it("blocks a conflicting scene edit with an explanation and preserves artwork through a subsequent valid save", async () => {
  directory = await mkdtemp(join(tmpdir(), "earth-app-visual-sequence-"));
  const store = new ProjectStore(directory);
  let project = await store.create({ title: "River story" });
  const scene = {
    width: 1000,
    height: 500,
    layers: [{ id: "river", kind: "path", pathData: "M 0 0 L 1 0 L .5 1 Z" }],
  };
  project.chapters = [
    {
      id: "opening",
      type: "prose",
      title: "Opening",
      narrative: "A fictional river.",
    },
    {
      id: "ending",
      type: "prose",
      title: "Ending",
      narrative: "At the river mouth.",
    },
  ];
  project.visualSequences = [
    visualSequenceSchema.parse({
      id: "river-scene",
      alt: "Illustrative river",
      caption: "Original caption",
      scene,
      steps: [{ chapterId: "opening", start: 0, end: 1 }],
    }),
  ];
  project.visualAccents = [
    visualAccentSchema.parse({
      id: "river-mouth",
      chapterId: "ending",
      alt: "Illustrative river mouth",
      placement: "trailing",
      scene,
    }),
  ];
  project = await store.save(project.id, project);
  api.openProject.mockResolvedValue(project);
  api.listProjects.mockImplementation(() => store.list());
  api.getExamples.mockResolvedValue(null);
  api.saveProject.mockImplementation((value: StoryProject) =>
    store.save(value.id, value),
  );
  localStorage.clear();
  window.history.replaceState(null, "", `/stories/${project.id}`);
  render(
    <EarthStoriesProvider>
      <App />
    </EarthStoriesProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /Story settings/i }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Extend scene over companion artwork",
    }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Remove the companion artwork explicitly before extending a scene over it",
  );
  expect(api.saveProject).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Update scene caption" }));
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await waitFor(() => expect(api.saveProject).toHaveBeenCalledTimes(1));
  await waitFor(async () => {
    const reopened = await store.read(project.id);
    expect(reopened.visualSequences).toEqual([
      { ...project.visualSequences![0]!, caption: "Updated caption" },
    ]);
    expect(reopened.visualAccents).toEqual(project.visualAccents);
  });
  expect(screen.queryByRole("alert")).toBeNull();
});
