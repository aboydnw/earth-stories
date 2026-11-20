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

it("submits long reference URLs with a bounded display name", async () => {
  vi.mocked(api.generationStatus).mockResolvedValue({
    configured: true,
    running: false,
  } as never);
  vi.mocked(api.startGeneration).mockResolvedValue({ id: "new-job" } as never);
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
  fireEvent.change(screen.getByLabelText(/Working title/), {
    target: { value: "River" },
  });
  const url = "https://example.org/report.pdf?signature=" + "a".repeat(300);
  fireEvent.change(screen.getByLabelText("Public reference links"), {
    target: { value: url },
  });
  const button = screen.getByRole("button", { name: "Generate story" });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(button);
  await waitFor(() => expect(api.startGeneration).toHaveBeenCalled());
  const brief = vi.mocked(api.startGeneration).mock.calls.at(-1)![0];
  expect(brief.references[0]!.name.length).toBeLessThanOrEqual(200);
  expect(brief.references[0]).toMatchObject({ url });
  const { storyBriefSchema } = await import("@earth-stories/story-schema");
  expect(storyBriefSchema.safeParse(brief).success).toBe(true);
});
