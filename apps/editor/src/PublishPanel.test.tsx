// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthoringReadiness } from "@earth-stories/publisher/readiness";
import {
  storyProjectSchema,
  type StoryProject,
} from "@earth-stories/story-schema";
import { EarthStoriesProvider } from "@earth-stories/ui";

vi.mock("./api", () => ({
  exportProject: vi.fn(),
  shareCardUrl: vi.fn(
    (projectId: string, version = 0) =>
      `/api/projects/${projectId}/share-card${version ? `?v=${version}` : ""}`,
  ),
  uploadShareCard: vi.fn(),
}));
vi.mock("./captureShareCard", () => ({
  captureShareCard: vi.fn(),
}));
vi.mock("./captureSnapshots", () => ({
  captureMapSnapshots: vi.fn(),
  downloadAnimatedMapCaptures: vi.fn(),
  downloadMapSnapshots: vi.fn(),
}));
vi.mock("./ShareRehearsal", () => ({
  ShareRehearsal: ({ cardUrl }: { cardUrl?: string | null }) => (
    <div data-testid="share-rehearsal" data-card-url={cardUrl ?? ""} />
  ),
}));

import { exportProject, uploadShareCard } from "./api";
import { captureShareCard } from "./captureShareCard";
import { captureMapSnapshots } from "./captureSnapshots";
import { PublishPanel } from "./PublishPanel";
import type { PublicationReadinessState } from "./usePublicationReadiness";

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

const localReadiness: AuthoringReadiness = {
  manifest: {} as AuthoringReadiness["manifest"] & object,
  findings: [],
  stages: {
    story: "complete",
    chapters: "complete",
    data: "optional",
    preview: "complete",
    publish: "current",
    sharing: "current",
  },
};

function readyState(
  issues: NonNullable<PublicationReadinessState["result"]>["issues"] = [],
): PublicationReadinessState {
  return {
    status: "ready",
    result: {
      ready: !issues.some(({ severity }) => severity === "error"),
      issues,
      projectId: project.id,
      buildId: "build-1",
      estimatedIncludedBytes: 1024,
      includedAssets: 1,
      connectedAssets: 2,
      profile: "connected",
    },
    error: null,
    key: "field-notes:key",
  };
}

function panel(overrides: Partial<Parameters<typeof PublishPanel>[0]> = {}) {
  const props: Parameters<typeof PublishPanel>[0] = {
    open: true,
    project,
    onClose: vi.fn(),
    onBeforeExport: vi.fn().mockResolvedValue(project),
    onProfileChange: vi.fn().mockResolvedValue(project),
    preflightState: readyState(),
    onRefreshPreflight: vi.fn(),
    localReadiness,
    unsaved: false,
    ...overrides,
  };
  const view = render(
    <EarthStoriesProvider>
      <PublishPanel {...props} />
    </EarthStoriesProvider>,
  );
  return { ...view, props };
}

describe("PublishPanel", () => {
  it("leads with one recommended build and keeps specialized outputs collapsed", async () => {
    panel();
    expect(
      screen.getByRole("button", { name: /build publication/i }),
    ).toBeTruthy();
    const summary = screen.getByText("More output options");
    const disclosure = summary.closest("details");
    expect(disclosure?.open).toBe(false);

    await userEvent.click(summary);
    expect(disclosure?.open).toBe(true);
    expect(
      screen.getByRole("button", { name: /download archival html/i }),
    ).toBeTruthy();
  });

  it("keeps collapsed disclosure summaries inside the keyboard focus trap", async () => {
    panel();
    const close = screen.getByRole("button", {
      name: /close publication workshop/i,
    });
    const lastSummary = screen
      .getByText("Verify and share after deployment")
      .closest("summary");
    expect(document.activeElement).toBe(close);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(lastSummary);
  });

  it("runs current publication checks when opened without a result", () => {
    const onRefreshPreflight = vi.fn();
    panel({
      preflightState: {
        status: "idle",
        result: null,
        error: null,
        key: null,
      },
      onRefreshPreflight,
    });
    expect(onRefreshPreflight).toHaveBeenCalledOnce();
  });

  it("creates and stores a missing link preview before building", async () => {
    const operations: string[] = [];
    vi.mocked(captureShareCard).mockImplementation(async () => {
      operations.push("capture-card");
      return "data:image/png;base64,AAA";
    });
    vi.mocked(uploadShareCard).mockImplementation(async () => {
      operations.push("upload-card");
      return { bytes: 3 };
    });
    vi.mocked(captureMapSnapshots).mockImplementation(async () => {
      operations.push("capture-maps");
      return {};
    });
    vi.mocked(exportProject).mockImplementation(async () => {
      operations.push("export");
      return { directory: "/tmp/publication", buildId: "build-2" };
    });
    const onBeforeExport = vi.fn().mockImplementation(async () => {
      operations.push("save");
      return project;
    });
    panel({
      onBeforeExport,
      preflightState: readyState([
        {
          id: "share-card",
          area: "sharing",
          severity: "warning",
          message: "This story has no link preview image.",
        },
      ]),
    });

    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );
    await waitFor(() => expect(exportProject).toHaveBeenCalledOnce());
    expect(operations).toEqual([
      "save",
      "capture-card",
      "upload-card",
      "capture-maps",
      "export",
    ]);
    expect(exportProject).toHaveBeenCalledWith(project.id, "folder", {
      mapSnapshots: {},
      publicationUrl: "",
    });
  });

  it("reuses the stored link preview when the workshop is reopened", () => {
    panel();
    expect(screen.getByTestId("share-rehearsal").dataset.cardUrl).toBe(
      `/api/projects/${project.id}/share-card`,
    );
  });

  it("trims the deployed URL before adding it to a build", async () => {
    vi.mocked(captureMapSnapshots).mockResolvedValue({});
    vi.mocked(exportProject).mockResolvedValue({
      directory: "/tmp/publication",
    });
    panel();
    await userEvent.click(
      screen.getByText("Verify and share after deployment"),
    );
    await userEvent.type(
      screen.getByLabelText(/deployed publication url/i),
      "  example.org/story  ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );
    await waitFor(() =>
      expect(exportProject).toHaveBeenCalledWith(project.id, "folder", {
        mapSnapshots: {},
        publicationUrl: "example.org/story",
      }),
    );
  });

  it("reports clipboard failures without an unhandled rejection", async () => {
    vi.mocked(captureMapSnapshots).mockResolvedValue({});
    vi.mocked(exportProject).mockResolvedValue({
      snippet: '<iframe src="https://example.org/embed.html"></iframe>',
    });
    panel();
    await userEvent.click(screen.getByText("More output options"));
    await userEvent.click(
      screen.getByRole("button", { name: /create embed code/i }),
    );
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await userEvent.click(
      await screen.findByRole("button", { name: /copy iframe/i }),
    );
    expect(
      await screen.findByText(/embed code could not be copied/i),
    ).toBeTruthy();
  });
});
