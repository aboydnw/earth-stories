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
  startPublish: vi.fn(),
  getPublishJob: vi.fn(),
  getPublishRecord: vi.fn(),
}));
vi.mock("./captureSnapshots", () => ({
  captureMapSnapshots: vi.fn(async () => ({})),
}));

import { getPublishJob, getPublishRecord, startPublish } from "./api";
import type { PublishJob, PublishRecord } from "./api";
import {
  PublishToWeb,
  isMissingJobError,
  repoNameFromTitle,
} from "./PublishToWeb";

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

const job = (overrides: Partial<PublishJob> = {}): PublishJob => ({
  id: "job-1",
  projectId: project.id,
  status: "running",
  stage: "signing-in",
  events: [
    {
      stage: "signing-in",
      severity: "info",
      message: "Signing in to GitHub…",
      at: "2026-08-11T00:00:00.000Z",
    },
  ],
  deviceCode: null,
  url: null,
  record: null,
  error: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
  ...overrides,
});

const record: PublishRecord = {
  owner: "mapper",
  repo: "field-notes",
  url: "https://mapper.github.io/field-notes/",
  branch: "gh-pages",
  buildId: "build-1",
  publishedAt: "2026-08-11T00:00:00.000Z",
};

function panel(
  overrides: { disabled?: boolean; onPublished?: () => void } = {},
) {
  return render(
    <EarthStoriesProvider>
      <PublishToWeb
        project={project}
        disabled={overrides.disabled ?? false}
        onPublished={overrides.onPublished}
      />
    </EarthStoriesProvider>,
  );
}

describe("repoNameFromTitle", () => {
  it("matches what the service will name the repository", () => {
    expect(repoNameFromTitle("Field Notes: A Coastline")).toBe(
      "field-notes-a-coastline",
    );
    expect(repoNameFromTitle("!!!")).toBe("earth-story");
  });
});

it("recognizes a 404 as a job ended by workspace change", () => {
  expect(
    isMissingJobError(Object.assign(new Error("missing"), { status: 404 })),
  ).toBe(true);
  expect(isMissingJobError(new Error("temporary failure"))).toBe(false);
});

describe("PublishToWeb", () => {
  it("offers a repository name derived from the story title", async () => {
    vi.mocked(getPublishRecord).mockResolvedValue(null);
    panel();
    await waitFor(() =>
      expect(screen.getByRole("textbox")).toHaveProperty(
        "value",
        repoNameFromTitle(project.metadata.title),
      ),
    );
    expect(
      screen.getByRole("button", { name: /publish to the web/i }),
    ).toBeTruthy();
  });

  it("shows the device code the author must enter on GitHub", async () => {
    vi.mocked(getPublishRecord).mockResolvedValue(null);
    vi.mocked(startPublish).mockResolvedValue(
      job({
        deviceCode: {
          verificationUri: "https://github.com/login/device",
          userCode: "WXYZ-1234",
          expiresInSeconds: 900,
        },
      }),
    );
    vi.mocked(getPublishJob).mockResolvedValue(job({ status: "running" }));
    panel();
    await userEvent.click(
      screen.getByRole("button", { name: /publish to the web/i }),
    );
    expect(await screen.findByText("WXYZ-1234")).toBeTruthy();
  });

  it("reports progress while the publish runs", async () => {
    vi.mocked(getPublishRecord).mockResolvedValue(null);
    vi.mocked(startPublish).mockResolvedValue(
      job({
        stage: "uploading",
        events: [
          {
            stage: "uploading",
            severity: "info",
            message: "Uploading the release…",
            at: "2026-08-11T00:00:01.000Z",
          },
        ],
      }),
    );
    vi.mocked(getPublishJob).mockResolvedValue(job({ status: "running" }));
    panel();
    await userEvent.click(
      screen.getByRole("button", { name: /publish to the web/i }),
    );
    expect(await screen.findByText("Uploading the release…")).toBeTruthy();
  });

  it("shows the published link and tells the panel to refresh", async () => {
    const onPublished = vi.fn();
    vi.mocked(getPublishRecord).mockResolvedValue(null);
    vi.mocked(startPublish).mockResolvedValue(job());
    vi.mocked(getPublishJob).mockResolvedValue(
      job({
        status: "succeeded",
        stage: "done",
        url: record.url,
        record,
        events: [
          {
            stage: "done",
            severity: "info",
            message: `Published at ${record.url}`,
            at: "2026-08-11T00:00:02.000Z",
          },
        ],
      }),
    );
    panel({ onPublished });
    await userEvent.click(
      screen.getByRole("button", { name: /publish to the web/i }),
    );
    const link = await screen.findByRole(
      "link",
      { name: record.url },
      { timeout: 4000 },
    );
    expect(link.getAttribute("href")).toBe(record.url);
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
  });

  it("explains a failure instead of leaving the author guessing", async () => {
    vi.mocked(getPublishRecord).mockResolvedValue(null);
    vi.mocked(startPublish).mockResolvedValue(job());
    vi.mocked(getPublishJob).mockResolvedValue(
      job({
        status: "failed",
        stage: "uploading",
        error:
          'You already have a repository named "field-notes" with files in it.',
      }),
    );
    panel();
    await userEvent.click(
      screen.getByRole("button", { name: /publish to the web/i }),
    );
    expect(
      await screen.findByText(/already have a repository named/, undefined, {
        timeout: 4000,
      }),
    ).toBeTruthy();
  });

  it("keeps polling after a failed check instead of stalling forever", async () => {
    vi.mocked(getPublishRecord).mockResolvedValue(null);
    vi.mocked(startPublish).mockResolvedValue(job());
    vi.mocked(getPublishJob)
      .mockRejectedValueOnce(new Error("The local service is not responding."))
      .mockResolvedValue(
        job({ status: "succeeded", stage: "done", url: record.url, record }),
      );
    panel();
    await userEvent.click(
      screen.getByRole("button", { name: /publish to the web/i }),
    );
    expect(
      await screen.findByRole("link", { name: record.url }, { timeout: 6000 }),
    ).toBeTruthy();
    expect(vi.mocked(getPublishJob).mock.calls.length).toBeGreaterThan(1);
  });

  it("offers to update the story it already published", async () => {
    vi.mocked(getPublishRecord).mockResolvedValue(record);
    panel();
    expect(
      await screen.findByRole("button", { name: /update published story/i }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /field-notes/ })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("cannot publish while the story is not ready", async () => {
    vi.mocked(getPublishRecord).mockResolvedValue(null);
    panel({ disabled: true });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /publish to the web/i })
          .getAttribute("disabled"),
      ).not.toBeNull(),
    );
  });
});
