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
  await screen.findByRole("button", { name: "View as reader" });
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
  fireEvent.click(screen.getByRole("button", { name: "View as reader" }));
  await waitFor(() => expect(replace).toHaveBeenCalled());
  expect(api.saveProject).not.toHaveBeenCalled();
});
it("updates review readiness when another reader tab records the saved revision", async () => {
  await openEditor();
  fireEvent.click(screen.getByRole("button", { name: /Workflow status/ }));
  expect(await screen.findByText("Review again")).toBeTruthy();
  const key = `earth-stories:preview-receipt:${project.id}`;
  const value = JSON.stringify({
    projectId: project.id,
    revision: project.metadata.updated,
  });
  localStorage.setItem(key, value);
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        newValue: value,
        storageArea: localStorage,
      }),
    ),
  );
  await waitFor(() => expect(screen.queryByText("Review again")).toBeNull());
  expect(screen.getByText("Checks required")).toBeTruthy();
});
