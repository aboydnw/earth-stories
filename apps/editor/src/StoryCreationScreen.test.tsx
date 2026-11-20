// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { StoryCreationScreen } from "./StoryCreationScreen";
import * as api from "./api";
vi.mock("./api", () => ({
  generationStatus: vi
    .fn()
    .mockResolvedValue({ configured: false, running: false }),
  getGeneration: vi.fn(),
  acceptGeneration: vi.fn(),
  startGeneration: vi.fn(),
  cancelGeneration: vi.fn(),
  retryGeneration: vi.fn(),
  discardGeneration: vi.fn(),
  generationPreview: vi.fn(),
}));
afterEach(cleanup);
it("explains missing credentials and keeps generation disabled", async () => {
  render(
    <EarthStoriesProvider>
      <StoryCreationScreen
        jobId={null}
        preview={false}
        onNavigate={() => {}}
        onCreated={async () => {}}
        onBack={() => {}}
      />
    </EarthStoriesProvider>,
  );
  await screen.findByText(/OPENAI_API_KEY/);
  expect(
    (
      screen.getByRole("button", {
        name: "Generate story",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("accepts a ready candidate only once during rapid clicks", async () => {
  vi.mocked(api.getGeneration).mockResolvedValue({
    id: "job",
    stage: "ready",
    brief: { title: "River" },
    candidate: {
      digest: "digest",
      project: {
        metadata: { title: "River" },
        publication: { palette: {} },
        chapters: [],
      },
      warnings: [],
      assets: [],
    },
    assets: [],
    usage: [],
  } as never);
  vi.mocked(api.acceptGeneration).mockReturnValue(new Promise(() => {}));
  render(
    <EarthStoriesProvider>
      <StoryCreationScreen
        jobId="job"
        preview={false}
        onNavigate={() => {}}
        onCreated={async () => {}}
        onBack={() => {}}
      />
    </EarthStoriesProvider>,
  );
  const button = await screen.findByRole("button", {
    name: "Create this story",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(api.acceptGeneration).toHaveBeenCalledTimes(1));
});
