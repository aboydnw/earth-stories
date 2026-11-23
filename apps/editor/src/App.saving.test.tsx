// @vitest-environment jsdom
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { ProjectStore } from "@earth-stories/project-store";
import type { StoryProject } from "@earth-stories/story-schema";
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
let directory: string;
let store: ProjectStore;
let project: StoryProject;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "earth-app-saving-"));
  store = new ProjectStore(directory);
  project = await store.create({ title: "River story" });
  project.chapters = [
    {
      id: "opening",
      type: "prose",
      title: "Opening",
      narrative: "A fictional river.",
    },
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
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  localStorage.clear();
  await rm(directory, { recursive: true, force: true });
});
async function openEditor() {
  render(
    <EarthStoriesProvider>
      <App />
    </EarthStoriesProvider>,
  );
  await screen.findByRole("button", { name: "Publish" });
}
it("keeps edits made during a pending save and saves them again without a revision conflict", async () => {
  let finish!: (value: StoryProject) => void;
  api.saveProject.mockImplementationOnce(
    () =>
      new Promise<StoryProject>((resolve) => {
        finish = resolve;
      }),
  );
  await openEditor();
  fireEvent.click(screen.getByRole("button", { name: /Story settings/i }));
  const title = await screen.findByLabelText("Story title");
  fireEvent.change(title, { target: { value: "Submitted title" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await waitFor(() => expect(api.saveProject).toHaveBeenCalledTimes(1));
  fireEvent.change(title, { target: { value: "Edited during save" } });
  const submitted = api.saveProject.mock.calls[0]![0] as StoryProject;
  const saved = await store.save(project.id, submitted);
  await act(async () => finish(saved));
  expect((title as HTMLInputElement).value).toBe("Edited during save");
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await waitFor(() => expect(api.saveProject).toHaveBeenCalledTimes(2));
  await waitFor(async () =>
    expect((await store.read(project.id)).metadata.title).toBe(
      "Edited during save",
    ),
  );
  expect(screen.queryByRole("alert")).toBeNull();
});
it("opens an already-saved reader without writing the project again", async () => {
  const replace = vi.fn();
  vi.spyOn(window, "open").mockReturnValue({
    opener: window,
    location: { replace },
    close: vi.fn(),
  } as unknown as Window);
  await openEditor();
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /^Preview/ }));
  await waitFor(() => expect(replace).toHaveBeenCalled());
  expect(api.saveProject).not.toHaveBeenCalled();
});
it("keeps the header focused on saving and publishing", async () => {
  await openEditor();
  expect(screen.queryByRole("button", { name: /Workflow status/ })).toBeNull();
  expect(screen.queryByText("Saved locally")).toBeNull();
  expect(screen.queryByRole("button", { name: "View as reader" })).toBeNull();
});

it("waits for a pending save before preview saves newer edits", async () => {
  let finish!: (value: StoryProject) => void;
  api.saveProject.mockImplementationOnce(
    () =>
      new Promise<StoryProject>((resolve) => {
        finish = resolve;
      }),
  );
  const replace = vi.fn();
  vi.spyOn(window, "open").mockReturnValue({
    opener: window,
    location: { replace },
    close: vi.fn(),
  } as unknown as Window);
  await openEditor();
  fireEvent.click(screen.getByRole("button", { name: /Story settings/i }));
  const title = await screen.findByLabelText("Story title");
  fireEvent.change(title, { target: { value: "First save" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await waitFor(() => expect(api.saveProject).toHaveBeenCalledTimes(1));
  fireEvent.change(title, { target: { value: "Latest preview title" } });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /^Preview/ }));
  await act(async () => {});
  expect(api.saveProject).toHaveBeenCalledTimes(1);
  const saved = await store.save(project.id, api.saveProject.mock.calls[0]![0]);
  await act(async () => finish(saved));
  await waitFor(() => expect(replace).toHaveBeenCalled());
  expect(api.saveProject).toHaveBeenCalledTimes(2);
  expect((await store.read(project.id)).metadata.title).toBe(
    "Latest preview title",
  );
  expect(screen.queryByRole("alert")).toBeNull();
});

it("preserves the specific save failure and closes the reserved preview tab", async () => {
  api.saveProject.mockRejectedValueOnce(new Error("Disk is full"));
  const close = vi.fn();
  vi.spyOn(window, "open").mockReturnValue({
    opener: window,
    location: { replace: vi.fn() },
    close,
  } as unknown as Window);
  await openEditor();
  fireEvent.click(screen.getByRole("button", { name: /Story settings/i }));
  fireEvent.change(await screen.findByLabelText("Story title"), {
    target: { value: "Unsaved title" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /^Preview/ }));
  await waitFor(() => expect(screen.getByText("Disk is full")).toBeTruthy());
  expect(close).toHaveBeenCalledOnce();
});

it("shows the full story in the publishing workshop instead of the editable chapter canvas", async () => {
  project.chapters.push({
    id: "ending",
    type: "prose",
    title: "River ending",
    narrative: "The second chapter.",
  });
  await openEditor();
  expect(screen.queryByRole("heading", { name: "River ending" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
  fireEvent.click(
    await screen.findByRole("menuitem", { name: /Publish publicly/ }),
  );
  expect(
    await screen.findByRole("heading", { name: "River ending" }),
  ).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Chapter canvas" })).toBeNull();
  expect(api.saveProject).not.toHaveBeenCalled();
});

it("saves the current story before opening its visual enhancement form", async () => {
  await openEditor();
  fireEvent.click(screen.getByRole("button", { name: /Story settings/i }));
  fireEvent.change(await screen.findByLabelText("Story title"), {
    target: { value: "Saved for enhancement" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enhance with AI" }));
  await waitFor(() =>
    expect(window.location.pathname).toBe(`/stories/${project.id}/enhance`),
  );
  expect((await store.read(project.id)).metadata.title).toBe(
    "Saved for enhancement",
  );
});

it("keeps edits made while enhancement entry waits for a save", async () => {
  let finish!: (value: StoryProject) => void;
  api.saveProject.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await openEditor();
  fireEvent.click(screen.getByRole("button", { name: /Story settings/i }));
  const title = await screen.findByLabelText("Story title");
  fireEvent.change(title, { target: { value: "First title" } });
  fireEvent.click(screen.getByRole("button", { name: "Enhance with AI" }));
  await waitFor(() => expect(api.saveProject).toHaveBeenCalledTimes(1));
  fireEvent.change(title, { target: { value: "Latest title" } });
  const saved = await store.save(project.id, api.saveProject.mock.calls[0]![0]);
  await act(async () => finish(saved));
  await waitFor(() =>
    expect(window.location.pathname).toBe(`/stories/${project.id}/enhance`),
  );
  expect((await store.read(project.id)).metadata.title).toBe("Latest title");
});
