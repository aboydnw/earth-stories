// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("./PublishToWeb", () => ({
  PublishToWeb: ({ disabled }: { disabled?: boolean }) => (
    <div
      data-testid="publish-to-web"
      data-disabled={String(disabled ?? false)}
    />
  ),
}));

import { exportProject, uploadShareCard } from "./api";
import { captureShareCard } from "./captureShareCard";
import { captureMapSnapshots } from "./captureSnapshots";
import { PublishPanel } from "./PublishPanel";
import type { PublicationReadinessState } from "./usePublicationReadiness";
import type { DesktopBridge } from "./desktop";

const createObjectURL = vi.fn(() => "blob:publication");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.mocked(captureMapSnapshots).mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete window.earthStoriesDesktop;
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
  resultOverrides: Partial<
    NonNullable<PublicationReadinessState["result"]>
  > = {},
): PublicationReadinessState {
  return {
    status: "ready",
    result: {
      ready: !issues.some(({ severity }) => severity === "error"),
      issues,
      projectId: project.id,
      buildId: "build-1",
      estimatedIncludedBytes: 1024,
      requiredDownloadBytes: 0,
      unknownDownloadSizes: 0,
      availableDiskBytes: 5 * 1024 ** 2,
      needsBuildInternet: false,
      needsRuntimeInternet: true,
      includedAssets: 1,
      connectedAssets: 2,
      profile: "connected",
      ...resultOverrides,
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
    onPublicationChange: vi.fn().mockResolvedValue(project),
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
  it("offers an offline delivery profile with a precise runtime promise", async () => {
    panel();

    await userEvent.click(screen.getByText("Release settings"));

    expect(screen.getByRole("radio", { name: /offline/i })).toBeTruthy();
    expect(
      screen.getByText("No internet required after this build."),
    ).toBeTruthy();
  });

  it("separates assembly downloads from publication runtime connectivity", async () => {
    panel({
      preflightState: readyState([], {
        requiredDownloadBytes: 1536,
        unknownDownloadSizes: 2,
        availableDiskBytes: 5 * 1024 ** 2,
        needsBuildInternet: true,
        needsRuntimeInternet: false,
        profile: "offline",
      }),
    });

    await userEvent.click(screen.getByText("Release settings"));

    expect(screen.getByText("Assembly inputs")).toBeTruthy();
    expect(screen.getByText("Internet needed during assembly")).toBeTruthy();
    expect(screen.getByText(/1\.5 KB to download/)).toBeTruthy();
    expect(screen.getByText(/2 inputs have unknown sizes/)).toBeTruthy();
    expect(screen.getByText(/5\.0 MB available/)).toBeTruthy();
    expect(screen.getByText("Publication runtime")).toBeTruthy();
    expect(
      screen.getAllByText("No internet required after this build."),
    ).toHaveLength(2);
  });

  it("does not claim an offline selection or preflight is verified", async () => {
    const offlineProject = {
      ...project,
      publication: { ...project.publication, profile: "offline" as const },
    };
    panel({
      project: offlineProject,
      onBeforeExport: vi.fn().mockResolvedValue(offlineProject),
      preflightState: readyState([], {
        profile: "offline",
        needsBuildInternet: true,
        needsRuntimeInternet: false,
      }),
    });

    await userEvent.click(screen.getByText("Release settings"));

    expect(screen.queryByText("Verified offline")).toBeNull();
  });

  it("reports verified offline only after a successful offline export", async () => {
    const offlineProject = {
      ...project,
      publication: { ...project.publication, profile: "offline" as const },
    };
    vi.mocked(captureMapSnapshots).mockResolvedValue({});
    vi.mocked(exportProject).mockResolvedValue({
      blob: new Blob(["publication"]),
      filename: "story-build-offline.zip",
      buildId: "build-offline",
    });
    panel({
      project: offlineProject,
      onBeforeExport: vi.fn().mockResolvedValue(offlineProject),
      preflightState: readyState([], {
        profile: "offline",
        needsBuildInternet: true,
        needsRuntimeInternet: false,
      }),
    });

    expect(screen.queryByText("Verified offline")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );

    expect(await screen.findByText("Verified offline")).toBeTruthy();
  });

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
      return {
        blob: new Blob(["publication"]),
        filename: "story-build-2.zip",
        buildId: "build-2",
      };
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
    expect(exportProject).toHaveBeenCalledWith(project.id, "zip", {
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
      expect(exportProject).toHaveBeenCalledWith(project.id, "zip", {
        mapSnapshots: {},
        publicationUrl: "example.org/story",
      }),
    );
  });

  it("explains when the published story can continue in GeoLibre", async () => {
    panel();
    await userEvent.click(
      screen.getByText("Verify and share after deployment"),
    );
    expect(
      screen.getByText(/add the final https publication url/i),
    ).toBeTruthy();
    await userEvent.type(
      screen.getByLabelText(/deployed publication url/i),
      "https://example.org/story/",
    );
    expect(
      screen.getByText(/readers can open compatible published layers/i),
    ).toBeTruthy();
  });

  it("keeps offline compilation pending instead of claiming no compatible layers", async () => {
    panel({
      project: {
        ...project,
        publication: { ...project.publication, profile: "offline" },
      },
    });
    await userEvent.click(
      screen.getByText("Verify and share after deployment"),
    );
    await userEvent.type(
      screen.getByLabelText(/deployed publication url/i),
      "https://example.org/story/",
    );
    expect(
      screen.getByText(
        /geolibre availability will be checked when the publication is built/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/geolibre requires internet access/i)).toBeTruthy();
    expect(screen.queryByText(/this story has no layers/i)).toBeNull();
  });

  it("distinguishes local files, included copies, connected URLs, and GeoLibre access", async () => {
    panel();
    await userEvent.click(screen.getByText("Release settings"));

    expect(
      screen.getByText(/working files stay in your local workspace/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/1 asset will be copied into this publication/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/2 assets remain at their public source urls/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/geolibre receives only the public urls/i),
    ).toBeTruthy();
  });

  it("lets authors turn off the GeoLibre link", async () => {
    const { props } = panel();
    await userEvent.click(
      screen.getByText("Verify and share after deployment"),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /open in geolibre/i }),
    );
    expect(props.onPublicationChange).toHaveBeenCalledWith({
      geolibreContinuation: false,
    });
  });

  it("explains that readers will not see a disabled GeoLibre link", async () => {
    panel({
      project: {
        ...project,
        publication: { ...project.publication, geolibreContinuation: false },
      },
    });
    await userEvent.click(
      screen.getByText("Verify and share after deployment"),
    );
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", {
        name: /open in geolibre/i,
      }).checked,
    ).toBe(false);
    expect(screen.getByText(/will not see a geolibre link/i)).toBeTruthy();
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

function desktopBridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return {
    version: "0.1.0",
    platform: "darwin",
    chooseWorkspace: vi.fn(),
    exportDiagnostics: vi.fn(),
    workspacePath: vi.fn(),
    showWorkspaceFolder: vi.fn(),
    showProjectFolder: vi.fn(),
    showPublicationFolder: vi.fn().mockResolvedValue(undefined),
    openExternal: vi.fn(),
    listTools: vi.fn(),
    prepareTools: vi.fn(),
    removeTool: vi.fn(),
    ...overrides,
  };
}

describe("publication output recovery", () => {
  it("downloads the browser ZIP and keeps a retry link without rebuilding", async () => {
    vi.mocked(exportProject).mockResolvedValue({
      blob: new Blob(["zip"]),
      filename: "story.zip",
    });
    const { unmount } = panel();
    expect(screen.getByText("Publication ZIP")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );
    const retry = await screen.findByRole("link", {
      name: /download zip again/i,
    });
    expect(retry.getAttribute("href")).toBe("blob:publication");
    expect(retry.getAttribute("download")).toBe("story.zip");
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(screen.getByText(/download requested:/i)).toBeTruthy();
    expect(screen.getByText(/nothing has been uploaded/i)).toBeTruthy();
    expect(screen.getByText(/not your editable project folder/i)).toBeTruthy();
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Publication build status",
    );
    const feedback = screen.getByLabelText("Publication build status");
    expect(
      feedback.compareDocumentPosition(screen.getByTestId("publish-to-web")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Activating the real download link never calls the build API again.
    expect(exportProject).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByText("Upload to another host"));
    expect(
      screen.getByRole("link", { name: "Netlify Drop" }).getAttribute("href"),
    ).toBe("https://app.netlify.com/drop");
    expect(
      screen
        .getByRole("link", { name: "Cloudflare instructions" })
        .getAttribute("href"),
    ).toBe(
      "https://developers.cloudflare.com/pages/get-started/direct-upload/",
    );
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:publication");
  });

  it("shows the saved desktop folder and reveals it using only a project ID", async () => {
    const desktop = desktopBridge();
    window.earthStoriesDesktop = desktop;
    vi.mocked(exportProject).mockResolvedValue({
      directory: "/workspace/story/publication",
      buildId: "build-1",
    });
    panel();
    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: /show publication in finder/i,
      }),
    );
    expect(desktop.showPublicationFolder).toHaveBeenCalledWith(project.id);
    expect(exportProject).toHaveBeenCalledWith(
      project.id,
      "folder",
      expect.anything(),
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByText(/\/workspace\/story\/publication/)).toBeTruthy();
  });

  it("preserves the build result and location if revealing its folder fails", async () => {
    window.earthStoriesDesktop = desktopBridge({
      showPublicationFolder: vi
        .fn()
        .mockRejectedValue(new Error("Finder unavailable")),
    });
    vi.mocked(exportProject).mockResolvedValue({
      directory: "/workspace/story/publication",
    });
    panel();
    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: /show publication in finder/i,
      }),
    );
    expect(
      await screen.findByText(/folder could not be shown.*Finder unavailable/i),
    ).toBeTruthy();
    expect(screen.getByText("Your publication folder is ready.")).toBeTruthy();
    expect(screen.getByText(/\/workspace\/story\/publication/)).toBeTruthy();
  });

  it("supports older desktop bridges by revealing the project", async () => {
    const desktop = desktopBridge({ showPublicationFolder: undefined });
    window.earthStoriesDesktop = desktop;
    vi.mocked(exportProject).mockResolvedValue({
      directory: "/workspace/story/publication",
    });
    panel();
    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /show project folder/i }),
    );
    expect(desktop.showProjectFolder).toHaveBeenCalledWith(project.id);
    expect(
      screen.getByText(/open the publication folder inside/i),
    ).toBeTruthy();
  });

  it("does not download a late result after closing or overwrite a new session", async () => {
    let complete!: (result: Awaited<ReturnType<typeof exportProject>>) => void;
    vi.mocked(exportProject).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const view = panel();
    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );
    await waitFor(() => expect(exportProject).toHaveBeenCalledOnce());
    view.rerender(
      <EarthStoriesProvider>
        <PublishPanel {...view.props} open={false} />
      </EarthStoriesProvider>,
    );
    view.rerender(
      <EarthStoriesProvider>
        <PublishPanel {...view.props} open />
      </EarthStoriesProvider>,
    );
    complete({ blob: new Blob(["old"]), filename: "old.zip" });
    await waitFor(() =>
      expect(screen.queryByText(/building and validating/i)).toBeNull(),
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByText(/old.zip/)).toBeNull();
    vi.mocked(exportProject).mockResolvedValueOnce({
      blob: new Blob(["new"]),
      filename: "new.zip",
    });
    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );
    expect(await screen.findByText("new.zip")).toBeTruthy();
  });

  it("makes save and build failures visible next to the action and allows a retry", async () => {
    const save = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(project);
    vi.mocked(exportProject).mockRejectedValueOnce(new Error("Disk is full"));
    panel({ onBeforeExport: save });
    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );
    expect(await screen.findByText(/story could not be saved/i)).toBeTruthy();
    expect(exportProject).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );
    expect(await screen.findByText("Disk is full")).toBeTruthy();
    vi.mocked(exportProject).mockResolvedValueOnce({
      blob: new Blob(["zip"]),
      filename: "retry.zip",
    });
    await userEvent.click(
      screen.getByRole("button", { name: /build publication/i }),
    );
    expect(await screen.findByText("retry.zip")).toBeTruthy();
    expect(screen.queryByText("Disk is full")).toBeNull();
  });

  it("blocks repeated builds while one is in progress", async () => {
    let complete!: (result: Awaited<ReturnType<typeof exportProject>>) => void;
    vi.mocked(exportProject).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    panel();
    await userEvent.dblClick(
      screen.getByRole("button", { name: /build publication/i }),
    );
    await waitFor(() => expect(exportProject).toHaveBeenCalledOnce());
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Building…" })
        .disabled,
    ).toBe(true);
    expect(screen.getByTestId("publish-to-web").dataset.disabled).toBe("true");
    complete({ blob: new Blob(["zip"]), filename: "once.zip" });
    expect(await screen.findByText("once.zip")).toBeTruthy();
  });
});
