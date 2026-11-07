// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  storyProjectSchema,
  type StoryProject,
} from "@earth-stories/story-schema";
import { EarthStoriesProvider } from "@earth-stories/ui";

vi.mock("./api", () => ({
  getGitHubConnection: vi.fn(),
  connectGitHub: vi.fn(),
  disconnectGitHub: vi.fn(),
  cancelGitHubConnection: vi.fn(),
  getGitHubRepositories: vi.fn(),
  startPublish: vi.fn(),
  getPublishJob: vi.fn(),
  getPublishRecord: vi.fn(),
}));
vi.mock("./captureSnapshots", () => ({
  captureMapSnapshots: vi.fn(async () => ({})),
}));

import {
  getGitHubConnection,
  getGitHubRepositories,
  connectGitHub,
  cancelGitHubConnection,
  disconnectGitHub,
  getPublishJob,
  getPublishRecord,
  startPublish,
} from "./api";
import type { PublishJob, PublishRecord } from "./api";
import { PublishToWeb, repoNameFromTitle } from "./PublishToWeb";
import { captureMapSnapshots } from "./captureSnapshots";
import { isMissingJobError } from "./httpErrors";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
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
  repositoryId: 42,
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
  it("requires an explicit repository selection without automatic sign-in", async () => {
    panel();
    await screen.findByRole("combobox");
    expect(
      screen.getByRole("button", { name: /publish to the web/i }),
    ).toHaveProperty("disabled", true);
    expect(connectGitHub).not.toHaveBeenCalled();
    await chooseRepository();
    expect(
      screen.getByRole("button", { name: /publish to the web/i }),
    ).toHaveProperty("disabled", false);
  });

  it("connects only after a click and presents an explicit browser link", async () => {
    vi.mocked(getGitHubConnection).mockResolvedValue({
      ...connection,
      status: "disconnected",
      login: null,
    });
    vi.mocked(connectGitHub).mockResolvedValue({
      ...connection,
      status: "connecting",
      authorizationUrl:
        "https://github.com/login/oauth/authorize?state=example",
    });
    panel();
    await userEvent.click(
      await screen.findByRole("button", { name: "Connect GitHub" }),
    );
    expect(
      (
        await screen.findByRole("link", { name: "Continue on GitHub" })
      ).getAttribute("href"),
    ).toContain("https://github.com/login/oauth/authorize");
    expect(startPublish).not.toHaveBeenCalled();
    vi.mocked(cancelGitHubConnection).mockResolvedValue({
      ...connection,
      status: "disconnected",
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel connection" }),
    );
    await screen.findByRole("button", { name: "Connect GitHub" });
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
    await chooseRepository();
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
    await chooseRepository();
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
    await chooseRepository();
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
    await chooseRepository();
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
    expect(screen.getByRole("link", { name: /mapper.github.io/ })).toBeTruthy();
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

const connection = {
  configured: true,
  status: "connected" as const,
  login: "mapper",
  authorizationUrl: null,
  installationUrl: "https://github.com/apps/earth-stories/installations/new",
  error: null,
};
const repository = {
  id: 42,
  installationId: 7,
  owner: "mapper",
  name: "field-notes",
  fullName: "mapper/field-notes",
};
beforeEach(() => {
  vi.mocked(captureMapSnapshots).mockResolvedValue({});
  vi.mocked(getPublishRecord).mockResolvedValue(null);
  vi.mocked(getGitHubConnection).mockResolvedValue(connection);
  vi.mocked(getGitHubRepositories).mockResolvedValue([repository]);
  vi.mocked(cancelGitHubConnection).mockResolvedValue({
    ...connection,
    status: "disconnected",
  });
});
async function chooseRepository() {
  await screen.findByRole("option", { name: repository.fullName });
  await userEvent.selectOptions(screen.getByRole("combobox"), "42");
}

it("sends only the chosen repository ID and snapshots, never browser credentials", async () => {
  vi.mocked(startPublish).mockResolvedValue(job({ status: "succeeded" }));
  panel();
  await chooseRepository();
  await userEvent.click(
    screen.getByRole("button", { name: /publish to the web/i }),
  );
  expect(startPublish).toHaveBeenCalledWith(project.id, {
    repositoryId: 42,
    reviewedRepository: {
      login: "mapper",
      id: 42,
      installationId: 7,
      owner: "mapper",
      name: "field-notes",
    },
    mapSnapshots: {},
  });
});

it("explains unavailable configuration and preserves the local ZIP alternative", async () => {
  vi.mocked(getGitHubConnection).mockResolvedValue({
    ...connection,
    configured: false,
    status: "disconnected",
  });
  panel();
  expect(
    await screen.findByText(/GitHub connection is not configured/),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Connect GitHub" })).toBeNull();
  expect(
    screen.getByRole("button", { name: /publish to the web/i }),
  ).toHaveProperty("disabled", true);
});

it("does not silently change a revoked previous destination", async () => {
  vi.mocked(getPublishRecord).mockResolvedValue(record);
  vi.mocked(getGitHubRepositories).mockResolvedValue([
    { ...repository, id: 88, name: "other", fullName: "mapper/other" },
  ]);
  panel();
  expect(await screen.findByText(/The previous destination/)).toBeTruthy();
  expect(screen.getByRole("combobox")).toHaveProperty("value", "");
  expect(
    screen.getByRole("button", { name: /update published story/i }),
  ).toHaveProperty("disabled", true);
});

it("clears a removed repository on refresh and explains the empty list", async () => {
  panel();
  await chooseRepository();
  vi.mocked(getGitHubRepositories).mockResolvedValue([]);
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh repositories" }),
  );
  expect(await screen.findByText(/No repositories are available/)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /publish to the web/i }),
  ).toHaveProperty("disabled", true);
  expect(
    screen
      .getByRole("link", { name: "Create one on GitHub" })
      .getAttribute("href"),
  ).toBe("https://github.com/new");
});

it("retries repository loading and disconnects locally", async () => {
  vi.mocked(getGitHubRepositories).mockRejectedValueOnce(new Error("Offline"));
  panel();
  await screen.findByText(/Offline/);
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh repositories" }),
  );
  await chooseRepository();
  vi.mocked(disconnectGitHub).mockResolvedValue({
    ...connection,
    status: "disconnected",
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Disconnect GitHub" }),
  );
  await screen.findByRole("button", { name: "Connect GitHub" });
  expect(
    screen.getByRole("button", { name: /publish to the web/i }),
  ).toHaveProperty("disabled", true);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("polls connection completion before loading repositories", async () => {
  vi.mocked(getGitHubConnection)
    .mockResolvedValueOnce({
      ...connection,
      status: "connecting",
      authorizationUrl: "https://github.com/login/oauth/authorize",
    })
    .mockResolvedValue(connection);
  panel();
  await screen.findByRole("link", { name: "Continue on GitHub" });
  expect(getGitHubRepositories).not.toHaveBeenCalled();
  await screen.findByRole("combobox", {}, { timeout: 4000 });
  expect(getGitHubRepositories).toHaveBeenCalledTimes(1);
});

it("shows sign-in failure and lets the author reconnect", async () => {
  vi.mocked(getGitHubConnection).mockResolvedValue({
    ...connection,
    status: "failed",
    error: "Authorization expired.",
  });
  panel();
  expect(await screen.findByText("Authorization expired.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Connect GitHub" })).toHaveProperty(
    "disabled",
    false,
  );
});

it("retries a failed initial connection check", async () => {
  vi.mocked(getGitHubConnection).mockRejectedValueOnce(
    new Error("Network unavailable"),
  );
  panel();
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry connection check" }),
  );
  await screen.findByRole("combobox");
});

it("cancels a pending connection when the workshop closes and ignores late replies", async () => {
  vi.mocked(getGitHubConnection).mockResolvedValue({
    ...connection,
    status: "disconnected",
  });
  const pendingConnection = deferred<typeof connection>();
  vi.mocked(connectGitHub).mockReturnValue(pendingConnection.promise);
  const view = panel();
  await userEvent.dblClick(
    await screen.findByRole("button", { name: "Connect GitHub" }),
  );
  expect(connectGitHub).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(cancelGitHubConnection).toHaveBeenCalledTimes(1);
  await act(async () => {
    pendingConnection.resolve(connection);
  });
  expect(getGitHubRepositories).not.toHaveBeenCalled();
});

it("prevents repeated publish starts while snapshots are being captured", async () => {
  const snapshots = deferred<Record<string, string>>();
  vi.mocked(captureMapSnapshots).mockReturnValue(snapshots.promise);
  vi.mocked(startPublish).mockResolvedValue(job({ status: "succeeded" }));
  panel();
  await chooseRepository();
  await userEvent.dblClick(
    screen.getByRole("button", { name: /publish to the web/i }),
  );
  expect(captureMapSnapshots).toHaveBeenCalledTimes(1);
  await act(async () => {
    snapshots.resolve({});
  });
  expect(startPublish).toHaveBeenCalledTimes(1);
});

it("does not start a publish after the workshop closes during snapshot capture", async () => {
  const snapshots = deferred<Record<string, string>>();
  vi.mocked(captureMapSnapshots).mockReturnValue(snapshots.promise);
  const view = panel();
  await chooseRepository();
  await userEvent.click(
    screen.getByRole("button", { name: /publish to the web/i }),
  );
  view.unmount();
  await act(async () => {
    snapshots.resolve({});
  });
  expect(startPublish).not.toHaveBeenCalled();
});

it("ignores a prior project's late publication record after switching projects", async () => {
  const previous = deferred<PublishRecord | null>();
  vi.mocked(getPublishRecord)
    .mockReturnValueOnce(previous.promise)
    .mockResolvedValue(null);
  const view = panel();
  view.rerender(
    <EarthStoriesProvider>
      <PublishToWeb
        project={{ ...project, id: "another-story" }}
        disabled={false}
      />
    </EarthStoriesProvider>,
  );
  await screen.findByRole("combobox");
  await act(async () => {
    previous.resolve(record);
  });
  expect(
    screen.queryByRole("button", { name: /update published story/i }),
  ).toBeNull();
  expect(screen.getByRole("combobox")).toHaveProperty("value", "");
});

it("does not automatically select a recreated repository with the same name", async () => {
  vi.mocked(getPublishRecord).mockResolvedValue({
    ...record,
    repositoryId: 11,
  });
  panel();
  await screen.findByRole("option", { name: repository.fullName });
  expect(screen.getByRole("combobox")).toHaveProperty("value", "");
  expect(
    screen.getByRole("button", { name: /update published story/i }),
  ).toHaveProperty("disabled", true);
  expect(screen.getByText(/The previous destination/)).toBeTruthy();
});

it("requires explicit repository selection for a legacy publication record", async () => {
  vi.mocked(getPublishRecord).mockResolvedValue({
    ...record,
    repositoryId: undefined,
  });
  panel();
  await screen.findByRole("option", { name: repository.fullName });
  expect(screen.getByRole("combobox")).toHaveProperty("value", "");
  expect(
    screen.getByText(/saved before repository identity checks/),
  ).toBeTruthy();
  await chooseRepository();
  expect(
    screen.getByRole("button", { name: /update published story/i }),
  ).toHaveProperty("disabled", false);
});

it("supports keyboard connection initiation and labels the browser continuation", async () => {
  vi.mocked(getGitHubConnection).mockResolvedValue({
    ...connection,
    status: "disconnected",
  });
  vi.mocked(connectGitHub).mockResolvedValue({
    ...connection,
    status: "connecting",
    authorizationUrl: "https://github.com/login/oauth/authorize?state=example",
  });
  panel();
  const connect = await screen.findByRole("button", { name: "Connect GitHub" });
  const user = userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(connect);
  await user.keyboard("{Enter}");
  expect(
    await screen.findByRole("link", { name: "Continue on GitHub" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Cancel connection" }),
  ).toHaveProperty("disabled", false);
  expect(startPublish).not.toHaveBeenCalled();
});

it("keeps installation, labelled repository selection, and refresh keyboard accessible", async () => {
  panel();
  await screen.findByRole("option", { name: repository.fullName });
  const user = userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("link", { name: "Install / select repositories" }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("combobox", { name: "Publication repository" }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("link", { name: "Create one on GitHub" }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Refresh repositories" }),
  );
  expect(
    screen.getByText(/Administration write permission is needed/),
  ).toBeTruthy();
});

it.each([
  { name: "renamed", fullName: "mapper/renamed" },
  { owner: "new-owner", fullName: "new-owner/field-notes" },
  { installationId: 99 },
])(
  "requires renewed review after selected repository identity changes: %j",
  async (change) => {
    panel();
    await chooseRepository();
    vi.mocked(getGitHubRepositories).mockResolvedValue([
      { ...repository, ...change },
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh repositories" }),
    );
    await screen.findByText(/The selected repository changed/);
    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
    expect(
      screen.getByRole("button", { name: /publish to the web/i }),
    ).toHaveProperty("disabled", true);
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh repositories" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Refresh repositories" }),
      ).toHaveProperty("disabled", false),
    );
    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
    await userEvent.selectOptions(screen.getByRole("combobox"), "42");
    expect(screen.queryByText(/The selected repository changed/)).toBeNull();
    vi.mocked(startPublish).mockResolvedValue(job({ status: "succeeded" }));
    await userEvent.click(
      screen.getByRole("button", { name: /publish to the web/i }),
    );
    expect(startPublish).toHaveBeenCalledWith(project.id, {
      repositoryId: 42,
      reviewedRepository: {
        login: "mapper",
        id: 42,
        installationId: change.installationId ?? 7,
        owner: change.owner ?? "mapper",
        name: change.name ?? "field-notes",
      },
      mapSnapshots: {},
    });
  },
);

it("preserves a reviewed repository only when its full identity is unchanged", async () => {
  panel();
  await chooseRepository();
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh repositories" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("combobox")).toHaveProperty("value", "42"),
  );
  expect(screen.queryByText(/The selected repository changed/)).toBeNull();
});

it("requires renewed repository review when the connected GitHub account changes", async () => {
  panel();
  await chooseRepository();
  vi.mocked(disconnectGitHub).mockResolvedValue({
    ...connection,
    status: "disconnected",
    login: null,
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Disconnect GitHub" }),
  );
  vi.mocked(connectGitHub).mockResolvedValue({
    ...connection,
    login: "another-account",
  });
  await userEvent.click(
    await screen.findByRole("button", { name: "Connect GitHub" }),
  );
  await screen.findByText(/The selected repository changed/);
  expect(screen.getByRole("combobox")).toHaveProperty("value", "");
  expect(
    screen.getByRole("button", { name: /publish to the web/i }),
  ).toHaveProperty("disabled", true);
  await chooseRepository();
  vi.mocked(startPublish).mockResolvedValue(job({ status: "succeeded" }));
  await userEvent.click(
    screen.getByRole("button", { name: /publish to the web/i }),
  );
  expect(startPublish).toHaveBeenCalledWith(
    project.id,
    expect.objectContaining({
      reviewedRepository: {
        login: "another-account",
        id: 42,
        installationId: 7,
        owner: "mapper",
        name: "field-notes",
      },
    }),
  );
});
