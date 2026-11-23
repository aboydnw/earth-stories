// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { IllustrationStudio } from "./IllustrationStudio";
const api = vi.hoisted(() => ({
  prepareArtworkImage: vi.fn(),
  importAsset: vi.fn(),
  saveProject: vi.fn(),
}));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  ...api,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const project = storyProjectSchema.parse({
  schema: "earth-stories/project/v3",
  id: "story",
  basemap: {
    id: "neutral",
    label: "Neutral",
    styleUrl: "https://example.com/style.json",
    attribution: null,
  },
  metadata: {
    title: "Ice",
    description: "",
    created: "2026-11-23T00:00:00Z",
    updated: "2026-11-23T00:00:00Z",
  },
  chapters: [
    {
      id: "opening",
      type: "prose",
      title: "Opening",
      narrative: "Original text",
    },
  ],
  sources: [],
  dataAssets: [],
});
it("keeps uploads private until explicitly adding the previewed scene and preserves original content", async () => {
  api.prepareArtworkImage.mockResolvedValue({
    data: "aW1hZ2U=",
    thumbnail: "aW1hZ2U=",
    width: 1200,
    height: 800,
    hasTransparency: false,
  });
  api.importAsset.mockImplementation(async (_id, file) => ({
    path: `assets/${file.name}`,
    filename: file.name,
    sizeBytes: file.size,
  }));
  api.saveProject.mockImplementation(async (value) => value);
  const saved = vi.fn();
  render(
    <EarthStoriesProvider>
      <IllustrationStudio project={project} onSaved={saved} onBack={() => {}} />
    </EarthStoriesProvider>,
  );
  fireEvent.change(screen.getByLabelText("Original illustration"), {
    target: {
      files: [new File(["image"], "glacier.png", { type: "image/png" })],
    },
  });
  await screen.findByRole("button", { name: "Add illustration to story" });
  expect(api.importAsset).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Layer 1 opacity"), {
    target: { value: "0.6" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Add illustration to story" }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  const result = saved.mock.calls[0]![0];
  expect(result.chapters[0]).toEqual(project.chapters[0]);
  expect(result.chapters[1].scene.layers[0].opacity).toBe(0.6);
  expect(result.sources.some((s: any) => s.label.includes("Original"))).toBe(
    true,
  );
});
it("reports preparation failures without importing artwork or changing a story", async () => {
  api.prepareArtworkImage.mockRejectedValue(new Error("Invalid image"));
  render(
    <EarthStoriesProvider>
      <IllustrationStudio
        project={project}
        onSaved={() => {}}
        onBack={() => {}}
      />
    </EarthStoriesProvider>,
  );
  fireEvent.change(screen.getByLabelText("Original illustration"), {
    target: { files: [new File(["bad"], "bad.png", { type: "image/png" })] },
  });
  await screen.findByText("Invalid image");
  expect(api.saveProject).not.toHaveBeenCalled();
  expect(api.importAsset).not.toHaveBeenCalled();
});
