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
vi.mock("@earth-stories/viewer", () => ({ StoryViewer: () => null }));
vi.mock("./api", () => ({
  chatGPTStatus: vi.fn().mockResolvedValue({
    configured: false,
    pending: false,
    activeAccount: null,
    accounts: [],
    error: null,
  }),
  chatGPTModels: vi
    .fn()
    .mockResolvedValue([{ id: "model", label: "Story model" }]),
  connectChatGPT: vi.fn(),
  cancelChatGPT: vi.fn(),
  disconnectChatGPT: vi.fn(),
  openProject: vi.fn(),
  enhanceStory: vi.fn(),
  getGeneration: vi.fn(),
  getGenerationBrief: vi.fn(),
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
        onWorkspace={() => {}}
        jobId={null}
        preview={false}
        onNavigate={() => {}}
        onCreated={async () => {}}
        onBack={() => {}}
      />
    </EarthStoriesProvider>,
  );
  await screen.findByRole("button", { name: "Continue with ChatGPT" });
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
        onWorkspace={() => {}}
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
  vi.mocked(api.chatGPTStatus).mockResolvedValue({
    configured: true,
    pending: false,
    activeAccount: "account",
    accounts: [
      { id: "account", label: "Author", connected: true, planEnabled: true },
    ],
    error: null,
  } as never);
  vi.mocked(api.startGeneration).mockResolvedValue({ id: "new-job" } as never);
  render(
    <EarthStoriesProvider>
      <StoryCreationScreen
        onWorkspace={() => {}}
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
  fireEvent.change(screen.getByLabelText("Reference links and notes"), {
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

it("restores a failed brief and its references, then submits edits as a new job", async () => {
  const original = {
    title: "Birds",
    audience: "Everyone",
    takeaway: "Notice eggs",
    narrative: "Original context",
    visualDirection: "Soft colors",
    requestedOutputs: ["prose"],
    references: [
      {
        kind: "url",
        name: "Website",
        classification: "background",
        url: "https://example.org/",
      },
      {
        kind: "upload",
        name: "notes.txt",
        classification: "facts",
        mediaType: "text/plain",
        data: "aGVsbG8=",
      },
    ],
  };
  vi.mocked(api.getGeneration).mockResolvedValue({
    id: "failed-job",
    stage: "failed",
    brief: { ...original, references: [] },
    error: "Unsupported reference",
    candidate: null,
    usage: [],
  } as never);
  vi.mocked(api.getGenerationBrief).mockResolvedValue(original as never);
  vi.mocked(api.chatGPTStatus).mockResolvedValue({
    configured: true,
    pending: false,
    activeAccount: "account",
    accounts: [
      { id: "account", label: "Author", connected: true, planEnabled: true },
    ],
    error: null,
  } as never);
  vi.mocked(api.startGeneration)
    .mockClear()
    .mockResolvedValue({ id: "corrected-job" } as never);
  const navigate = vi.fn();
  render(
    <EarthStoriesProvider>
      <StoryCreationScreen
        onWorkspace={() => {}}
        jobId="failed-job"
        preview={false}
        onNavigate={navigate}
        onCreated={async () => {}}
        onBack={() => {}}
      />
    </EarthStoriesProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit instructions" }),
  );
  const title = await screen.findByLabelText(/Working title/);
  expect((title as HTMLInputElement).value).toBe("Birds");
  expect(
    (screen.getByLabelText(/Visual direction/) as HTMLTextAreaElement).value,
  ).toBe("Soft colors");
  expect(screen.getByText("notes.txt")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
  fireEvent.change(title, { target: { value: "Bird eggs" } });
  const submit = screen.getByRole("button", { name: "Generate story" });
  await waitFor(() =>
    expect((submit as HTMLButtonElement).disabled).toBe(false),
  );
  const links = Array.from(
    { length: 20 },
    (_, i) => `https://example.org/${i}.txt`,
  );
  fireEvent.change(screen.getByLabelText("Reference links and notes"), {
    target: { value: links.join("\n") },
  });
  fireEvent.click(submit);
  expect(
    await screen.findByText(
      "Use at most 20 references, including files and links.",
    ),
  ).toBeTruthy();
  expect(api.startGeneration).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Reference links and notes"), {
    target: { value: links.slice(0, 19).join("\n") },
  });
  fireEvent.click(submit);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("corrected-job"));
  expect(
    vi.mocked(api.startGeneration).mock.calls[0]![0].references,
  ).toHaveLength(20);
  expect(api.startGeneration).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: "Bird eggs",
      narrative: "Original context",
      references: expect.arrayContaining([original.references[1]]),
    }),
  );
});

it.each([
  [1, "focused"],
  [3, "whole-story"],
])(
  "offers the correct default for an existing story with %i prose chapter(s)",
  async (chapterCount, treatment) => {
    const { storyProjectSchema } = await import("@earth-stories/story-schema");
    const project = storyProjectSchema.parse({
      schema: "earth-stories/project/v3",
      id: "existing",
      metadata: {
        title: "Existing river",
        description: "",
        author: null,
        created: "2026-11-20T00:00:00Z",
        updated: "2026-11-20T00:00:00Z",
      },
      basemap: {
        id: "neutral",
        label: "Neutral",
        styleUrl: "https://example.org/style.json",
        attribution: null,
      },
      sources: [],
      chapters: Array.from({ length: chapterCount }, (_, i) => ({
        id: `part-${i}`,
        type: "prose",
        title: `Part ${i + 1}`,
        narrative: "Keep this authored text.",
      })),
    });
    vi.mocked(api.openProject).mockResolvedValue(project);
    vi.mocked(api.enhanceStory).mockResolvedValue({
      id: "enhancement-job",
    } as never);
    vi.mocked(api.startGeneration).mockClear();
    const navigate = vi.fn();
    render(
      <EarthStoriesProvider>
        <StoryCreationScreen
          onWorkspace={() => {}}
          sourceProjectId="existing"
          jobId={null}
          preview={false}
          onNavigate={navigate}
          onCreated={async () => {}}
          onBack={() => {}}
        />
      </EarthStoriesProvider>,
    );
    const button = await screen.findByRole("button", {
      name: "Generate visual enhancements",
    });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
    expect(screen.queryByLabelText(/Working title/)).toBeNull();
    const select = screen.getByLabelText(
      "Visual treatment",
    ) as HTMLSelectElement;
    const whole = screen.getByRole("option", {
      name: /Whole story/,
    }) as HTMLOptionElement;
    expect(select.value).toBe(treatment);
    expect(whole.disabled).toBe(chapterCount < 3);
    if (chapterCount < 3)
      expect(screen.getByText(/Choose Focused artwork/)).toBeTruthy();
    fireEvent.change(
      screen.getByLabelText("What would you like to add or change visually?"),
      {
        target: { value: "Explain the flow visually" },
      },
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("enhancement-job"),
    );
    expect(api.enhanceStory).toHaveBeenCalledWith(
      "existing",
      expect.objectContaining({
        title: "Existing river",
        visualTreatment: treatment,
        visualDirection: "Explain the flow visually",
      }),
      {},
      project.metadata.updated,
    );
    expect(api.startGeneration).not.toHaveBeenCalled();
  },
);

it("does not label an already accepted result as unapplied", async () => {
  vi.mocked(api.getGeneration).mockResolvedValue({
    stage: "accepted",
  } as never);
  vi.mocked(api.generationPreview).mockResolvedValue({} as never);
  render(
    <EarthStoriesProvider>
      <StoryCreationScreen
        jobId="accepted"
        preview
        onWorkspace={() => {}}
        onBack={() => {}}
        onNavigate={() => {}}
        onCreated={async () => {}}
      />
    </EarthStoriesProvider>,
  );
  await screen.findByText("Story preview · saved result");
  expect(
    screen.queryByText("Story preview · not applied or published"),
  ).toBeNull();
});
it("validates an edited link and keeps its generated label in sync", async () => {
  render(
    <EarthStoriesProvider>
      <StoryCreationScreen
        jobId={null}
        preview={false}
        onWorkspace={() => {}}
        onBack={() => {}}
        onNavigate={() => {}}
        onCreated={async () => {}}
      />
    </EarthStoriesProvider>,
  );
  fireEvent.change(screen.getByLabelText("Reference links and notes"), {
    target: { value: "https://example.org/old" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add links" }));
  const input = screen.getByLabelText("Link") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "not a URL" } });
  expect(input.checkValidity()).toBe(false);
  fireEvent.change(input, { target: { value: "https://example.org/new" } });
  expect(input.checkValidity()).toBe(true);
  expect(screen.getByText("https://example.org/new")).toBeTruthy();
  expect(screen.queryByText("https://example.org/old")).toBeNull();
});

it("shows one busy state and cancellation without premature review actions", async () => {
  vi.mocked(api.getGeneration).mockResolvedValue({
    id: "working",
    stage: "planning",
    brief: {},
    candidate: null,
    usage: [],
  } as never);
  vi.mocked(api.cancelGeneration).mockResolvedValue({
    id: "working",
    stage: "cancelled",
    brief: {},
    candidate: null,
    usage: [],
  } as never);
  render(
    <EarthStoriesProvider>
      <StoryCreationScreen
        jobId="working"
        preview={false}
        onWorkspace={() => {}}
        onNavigate={() => {}}
        onCreated={async () => {}}
        onBack={() => {}}
      />
    </EarthStoriesProvider>,
  );
  const status = await screen.findByRole("status", {
    name: "Story generation",
  });
  expect(status.getAttribute("aria-busy")).toBe("true");
  expect(screen.queryByText("Your story is being prepared.")).toBeNull();
  expect(screen.queryByRole("button", { name: /Discard/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel generation" }));
  await screen.findByRole("button", { name: "Retry generation" });
  expect(screen.queryByRole("status", { name: "Story generation" })).toBeNull();
});
