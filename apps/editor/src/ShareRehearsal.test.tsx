// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  storyProjectSchema,
  type StoryProject,
} from "@earth-stories/story-schema";
import { EarthStoriesProvider } from "@earth-stories/ui";

vi.mock("./api", () => ({
  checkShareLink: vi.fn(),
  uploadShareCard: vi.fn(),
}));
vi.mock("./captureShareCard", () => ({
  captureShareCard: vi.fn(),
}));

import { checkShareLink, uploadShareCard } from "./api";
import { captureShareCard } from "./captureShareCard";
import { ShareRehearsal } from "./ShareRehearsal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const project: StoryProject = storyProjectSchema.parse(
  JSON.parse(
    readFileSync(
      join(process.cwd(), "fixtures/field-notes/story.json"),
      "utf8",
    ),
  ),
);

function rehearsal(
  overrides: Partial<StoryProject> = {},
  url = "",
  onBusyChange?: (busy: boolean) => void,
  onCardSaved?: () => void,
  cardUrl?: string,
) {
  return render(
    <EarthStoriesProvider>
      <ShareRehearsal
        project={{ ...project, ...overrides }}
        publicationUrl={url}
        cardUrl={cardUrl}
        disabled={false}
        onBusyChange={onBusyChange}
        onCardSaved={onCardSaved}
      />
    </EarthStoriesProvider>,
  );
}

describe("ShareRehearsal", () => {
  it("previews the story title and summary as readers will see it", () => {
    rehearsal({}, "https://example.org/field-notes");
    expect(screen.getByText(project.metadata.title)).toBeTruthy();
    expect(screen.getByText("EXAMPLE.ORG")).toBeTruthy();
  });

  it("normalizes a scheme-less URL for the preview domain", () => {
    rehearsal({}, "example.org/field-notes");
    expect(screen.getByText("EXAMPLE.ORG")).toBeTruthy();
  });

  it("shows a persisted card when the workshop is reopened", () => {
    const view = rehearsal(
      {},
      "https://example.org/field-notes",
      undefined,
      undefined,
      "/api/projects/field-notes/share-card",
    );
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
      "/api/projects/field-notes/share-card",
    );
  });

  it("cannot check a link before the author supplies a URL", () => {
    rehearsal();
    expect(
      screen
        .getByRole("button", { name: /check published link/i })
        .getAttribute("disabled"),
    ).not.toBeNull();
  });

  it("stores a rendered card and tells the author to export again", async () => {
    vi.mocked(captureShareCard).mockResolvedValue("data:image/png;base64,AAA");
    vi.mocked(uploadShareCard).mockResolvedValue({ bytes: 204800 });
    rehearsal();
    await userEvent.click(
      screen.getByRole("button", { name: /create preview image/i }),
    );
    await waitFor(() =>
      expect(uploadShareCard).toHaveBeenCalledWith(
        project.id,
        "data:image/png;base64,AAA",
      ),
    );
    expect(await screen.findByText(/200 KB/)).toBeTruthy();
  });

  it("asks for a readiness refresh once a card is saved", async () => {
    vi.mocked(captureShareCard).mockResolvedValue("data:image/png;base64,AAA");
    vi.mocked(uploadShareCard).mockResolvedValue({ bytes: 204800 });
    const onCardSaved = vi.fn();
    rehearsal({}, "", undefined, onCardSaved);
    await userEvent.click(
      screen.getByRole("button", { name: /create preview image/i }),
    );
    await waitFor(() => expect(onCardSaved).toHaveBeenCalled());
  });

  it("reports problems found on the published link", async () => {
    vi.mocked(checkShareLink).mockResolvedValue({
      url: "https://example.org/field-notes",
      reachable: true,
      title: "Field Notes",
      description: null,
      imageUrl: null,
      imageBytes: null,
      problems: [
        {
          id: "missing-image",
          severity: "error",
          message: "The published page has no og:image.",
        },
      ],
    });
    rehearsal({}, "https://example.org/field-notes");
    await userEvent.click(
      screen.getByRole("button", { name: /check published link/i }),
    );
    expect(
      await screen.findByText("The published page has no og:image."),
    ).toBeTruthy();
  });

  it("hides a report once the author edits the URL it described", async () => {
    vi.mocked(checkShareLink).mockResolvedValue({
      url: "https://example.org/field-notes",
      reachable: true,
      title: "Field Notes",
      description: "A coastline, mapped.",
      imageUrl: null,
      imageBytes: null,
      problems: [
        {
          id: "missing-image",
          severity: "error",
          message: "The published page has no og:image.",
        },
      ],
    });
    const view = rehearsal({}, "https://example.org/field-notes");
    await userEvent.click(
      screen.getByRole("button", { name: /check published link/i }),
    );
    expect(
      await screen.findByText("The published page has no og:image."),
    ).toBeTruthy();
    view.rerender(
      <EarthStoriesProvider>
        <ShareRehearsal
          project={project}
          publicationUrl="https://example.org/somewhere-else"
          disabled={false}
        />
      </EarthStoriesProvider>,
    );
    expect(
      screen.queryByText("The published page has no og:image."),
    ).toBeNull();
  });

  it("reports busy while a card upload is in flight", async () => {
    let release!: (value: { bytes: number }) => void;
    vi.mocked(captureShareCard).mockResolvedValue("data:image/png;base64,AAA");
    vi.mocked(uploadShareCard).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const onBusyChange = vi.fn();
    rehearsal({}, "", onBusyChange);
    await userEvent.click(
      screen.getByRole("button", { name: /create preview image/i }),
    );
    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(true));
    expect(onBusyChange).not.toHaveBeenCalledWith(false);
    release({ bytes: 1024 });
    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(false));
  });

  it("confirms a healthy link when nothing is wrong", async () => {
    vi.mocked(checkShareLink).mockResolvedValue({
      url: "https://example.org/field-notes",
      reachable: true,
      title: "Field Notes",
      description: "A coastline, mapped.",
      imageUrl: "https://example.org/field-notes/share/card-1.png",
      imageBytes: 180000,
      problems: [],
    });
    rehearsal({}, "https://example.org/field-notes");
    await userEvent.click(
      screen.getByRole("button", { name: /check published link/i }),
    );
    expect(
      await screen.findByText("The published link unfurls correctly."),
    ).toBeTruthy();
  });
});
