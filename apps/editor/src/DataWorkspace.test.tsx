// @vitest-environment jsdom
import { useState } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  projectSourceSchema,
  storyProjectSchema,
} from "@earth-stories/story-schema";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { DataWorkspace } from "./DataWorkspace";
import {
  listWorkspaceData,
  uploadWorkspaceData,
  addWorkspaceDataToStory,
  openProject,
  type ProjectSummary,
} from "./api";
vi.mock("./api", () => ({
  listWorkspaceData: vi.fn(),
  uploadWorkspaceData: vi.fn(),
  addWorkspaceDataToStory: vi.fn(),
  openProject: vi.fn(),
  discoverSource: vi.fn(),
  connectWorkspaceData: vi.fn(),
}));
vi.mock("@earth-stories/viewer/map", () => ({
  MapChapter: () => <div>Dataset preview</div>,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const source = projectSourceSchema.parse({
  id: "12345678-1234-1234-1234-123456789012",
  label: "places.geojson",
  kind: "local-geojson",
  path: "workspace-data/12345678-1234-1234-1234-123456789012/data.geojson",
  delivery: "included",
});
const project = storyProjectSchema.parse(
  JSON.parse(
    readFileSync(
      join(process.cwd(), "fixtures/field-notes/story.json"),
      "utf8",
    ),
  ),
);
const summary: ProjectSummary = {
  id: project.id,
  title: project.metadata.title,
  description: "",
  updated: project.metadata.updated,
  chapterCount: 0,
  isExample: false,
};
function Harness({ projects }: { projects: ProjectSummary[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <EarthStoriesProvider>
      <DataWorkspace
        projects={projects}
        examples={null}
        selectedDatasetId={selected}
        onDatasetChange={setSelected}
        onOpenStory={vi.fn()}
      />
    </EarthStoriesProvider>
  );
}
it("uploads without a story and later attaches the shared dataset with recoverable errors", async () => {
  vi.mocked(listWorkspaceData).mockResolvedValue({
    sources: [],
    invalidEntries: [],
  });
  vi.mocked(uploadWorkspaceData).mockResolvedValue(source);
  vi.mocked(openProject).mockResolvedValue({ ...project, sources: [] });
  vi.mocked(addWorkspaceDataToStory)
    .mockRejectedValueOnce(new Error("Story unavailable"))
    .mockResolvedValueOnce({ ...project, sources: [source] });
  const view = render(<Harness projects={[]} />);
  await userEvent.click(screen.getAllByRole("button", { name: "Add data" })[0]);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).queryByLabelText(/story/i)).toBeNull();
  const file = new File(
    ['{"type":"FeatureCollection","features":[]}'],
    "places.geojson",
    { type: "application/geo+json" },
  );
  await userEvent.upload(within(dialog).getByLabelText(/Local dataset/), file);
  const submit = within(dialog).getByRole("button", { name: "Add data" });
  expect(submit).toHaveProperty("disabled", false);
  fireEvent.submit(submit.closest("form")!);
  expect(
    await screen.findByText(/was added to the shared workspace library/),
  ).toBeTruthy();
  expect(uploadWorkspaceData).toHaveBeenCalledWith(file);
  expect(addWorkspaceDataToStory).not.toHaveBeenCalled();
  view.rerender(<Harness projects={[summary]} />);
  await userEvent.click(
    await screen.findByRole("button", {
      name: /places.geojson, local-geojson/,
    }),
  );
  await userEvent.selectOptions(screen.getByLabelText("Story"), project.id);
  await userEvent.click(screen.getByRole("button", { name: "Add to story" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Story unavailable",
  );
  await userEvent.click(screen.getByRole("button", { name: "Add to story" }));
  expect(await screen.findByText(/Shared data added to story/)).toBeTruthy();
  expect(addWorkspaceDataToStory).toHaveBeenLastCalledWith(
    source.id,
    project.id,
  );
});
it("shows an unreadable entry without hiding usable shared data", async () => {
  vi.mocked(listWorkspaceData).mockResolvedValue({
    sources: [source],
    invalidEntries: [{ id: "broken", reason: "Dataset record is invalid." }],
  });
  render(<Harness projects={[]} />);
  expect(
    await screen.findByRole("button", {
      name: /places.geojson, local-geojson/,
    }),
  ).toBeTruthy();
  expect(screen.getByText("Unavailable dataset broken")).toBeTruthy();
  expect(screen.getByText("Dataset record is invalid.")).toBeTruthy();
});
