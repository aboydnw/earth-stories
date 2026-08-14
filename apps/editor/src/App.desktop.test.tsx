// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { DesktopBridge } from "./desktop";

const api = vi.hoisted(() => ({
  actOnConversionJob: vi.fn(),
  getExamples: vi.fn(),
  getPublicationPreflight: vi.fn(),
  listProjects: vi.fn(),
  openProject: vi.fn(),
  saveProject: vi.fn(),
  startConversion: vi.fn(),
}));
const conversion = vi.hoisted(() => ({ poll: vi.fn() }));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  actOnConversionJob: api.actOnConversionJob,
  getExamples: api.getExamples,
  getPublicationPreflight: api.getPublicationPreflight,
  listProjects: api.listProjects,
  openProject: api.openProject,
  saveProject: api.saveProject,
  startConversion: api.startConversion,
}));
vi.mock("./conversionPolling", () => ({ pollConversionJob: conversion.poll }));

const project = {
  id: "project-one",
  title: "Desktop story",
  description: "A story kept on this computer",
  updated: "2026-08-12T00:00:00.000Z",
  chapterCount: 2,
  isExample: false,
};

function renderApp() {
  return render(
    <EarthStoriesProvider>
      <App />
    </EarthStoriesProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  api.getExamples.mockResolvedValue(null);
  api.listProjects.mockResolvedValue([project]);
  api.saveProject.mockImplementation(async (value) => value);
  api.getPublicationPreflight.mockResolvedValue({
    ready: true,
    projectId: "project-one",
    buildId: "offline-authoring-smoke",
    estimatedIncludedBytes: 12,
    requiredDownloadBytes: 0,
    unknownDownloadSizes: 0,
    availableDiskBytes: null,
    needsBuildInternet: false,
    needsRuntimeInternet: false,
    includedAssets: 1,
    connectedAssets: 0,
    profile: "offline",
    issues: [],
  });
});

afterEach(() => {
  cleanup();
  delete window.earthStoriesDesktop;
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("desktop editor controls", () => {
  it("opens an all-local project while browser networking is unavailable", async () => {
    window.history.replaceState(null, "", "/stories/project-one");
    const fetch = vi.fn(() => Promise.reject(new Error("network disabled")));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    api.openProject.mockResolvedValue({
      schema: "earth-stories/project/v2",
      id: "project-one",
      metadata: {
        title: "Offline field notebook",
        description: "All authoring inputs are already local.",
        author: null,
        created: "2026-08-13T00:00:00.000Z",
        updated: "2026-08-13T00:00:00.000Z",
      },
      basemap: {
        id: "local-neutral",
        label: "Local neutral",
        styleUrl: "http://127.0.0.1:4317/local-neutral-style.json",
        attribution: null,
      },
      publication: {
        profile: "offline",
        theme: "cng",
        offlineBasemap: { mode: "neutral" },
      },
      dataAssets: [],
      sources: [
        {
          id: "local-cover",
          kind: "image",
          label: "Local cover",
          path: "assets/local-cover.png",
          attribution: null,
          sizeBytes: 12,
          delivery: "included",
          provenance: {
            publisher: "Local author",
            sourceUrl: null,
            licenseName: null,
            licenseUrl: null,
            dataUpdatedAt: null,
            accessedAt: null,
            staleAfterDays: null,
            temporalCoverage: null,
            spatialCoverage: null,
            transformations: [],
          },
        },
      ],
      chapters: [
        {
          id: "opening",
          type: "image",
          title: "Local opening",
          narrative: "This chapter and its image are already on this computer.",
          sourceId: "local-cover",
          alt: "Local cover",
          caption: "Stored with the project",
        },
      ],
    });

    renderApp();

    expect(
      await screen.findAllByText("Offline field notebook"),
    ).not.toHaveLength(0);
    expect(await screen.findAllByText("Local opening")).not.toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("labels bundled examples that still need the network while authoring", async () => {
    api.listProjects.mockResolvedValue([]);
    api.getExamples.mockResolvedValue({
      stories: [
        {
          id: "connected-example",
          title: "Connected example",
          description: "Uses a remote source",
          chapterCount: 2,
          formats: ["cog"],
          authoringConnectivity: "network-required",
        },
      ],
      connections: [],
    });

    renderApp();

    expect(await screen.findByText("Connected example")).toBeTruthy();
    expect(screen.getByText("cog · Network required")).toBeTruthy();
  });

  it("detects the launch-static desktop bridge only on initial render", async () => {
    let reads = 0;
    Object.defineProperty(window, "earthStoriesDesktop", {
      configurable: true,
      get: () => {
        reads += 1;
        return undefined;
      },
    });
    const rendered = renderApp();
    await screen.findByText("Desktop story");

    rendered.rerender(
      <EarthStoriesProvider>
        <App />
      </EarthStoriesProvider>,
    );

    expect(reads).toBe(1);
  });

  it("keeps desktop-only controls and version out of the browser editor", async () => {
    renderApp();

    await screen.findByText("Desktop story");
    expect(
      screen.queryByRole("button", { name: /show project folder/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /choose workspace/i }),
    ).toBeNull();
    expect(screen.queryByText("Version 9.8.7")).toBeNull();
  });

  it("shows the desktop version and reveals the selected project folder", async () => {
    const revealedProjectIds: string[] = [];
    window.earthStoriesDesktop = {
      version: "9.8.7",
      platform: "linux",
      chooseWorkspace: async () => null,
      exportDiagnostics: async () => "cancelled",
      workspacePath: async () => "/documents/Earth Stories",
      showWorkspaceFolder: async () => undefined,
      showProjectFolder: async (projectId) => {
        revealedProjectIds.push(projectId);
      },
      openExternal: async () => undefined,
      listTools: async () => [],
      prepareTools: async () => [],
      removeTool: async () => undefined,
    } satisfies DesktopBridge;

    renderApp();

    await screen.findByText("Desktop story");
    expect(screen.getByText("Version 9.8.7")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /show project folder/i }),
    );
    expect(revealedProjectIds).toEqual(["project-one"]);
    expect(
      screen.queryByRole("button", { name: /choose workspace/i }),
    ).toBeNull();
  });

  it("shows workspace settings and invokes workspace and diagnostics actions", async () => {
    const actions: string[] = [];
    window.earthStoriesDesktop = {
      version: "9.8.7",
      platform: "linux",
      workspacePath: async () => "/documents/Earth Stories",
      showWorkspaceFolder: async () => {
        actions.push("show");
      },
      chooseWorkspace: async () => {
        actions.push("choose");
        return null;
      },
      exportDiagnostics: async () => {
        actions.push("export");
        return "exported";
      },
      showProjectFolder: async () => undefined,
      openExternal: async () => undefined,
      listTools: async () => [],
      prepareTools: async () => [],
      removeTool: async () => undefined,
    } satisfies DesktopBridge;

    renderApp();
    await screen.findByText("Desktop story");
    await userEvent.click(
      screen.getByRole("button", { name: /workspace settings/i }),
    );

    expect(await screen.findByText("/documents/Earth Stories")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /show folder/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /choose workspace/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /export diagnostics/i }),
    );
    expect(
      await screen.findByText(
        "Diagnostics exported and revealed in your file browser.",
      ),
    ).toBeTruthy();
    expect(actions).toEqual(["show", "choose", "export"]);
  });

  it("restores workspace settings from the workspace-change reload marker", async () => {
    window.history.replaceState(null, "", "/?workspace=settings");
    window.earthStoriesDesktop = {
      version: "9.8.7",
      platform: "linux",
      workspacePath: async () => "/documents/Changed Workspace",
      showWorkspaceFolder: async () => undefined,
      chooseWorkspace: async () => null,
      exportDiagnostics: async () => "cancelled",
      showProjectFolder: async () => undefined,
      openExternal: async () => undefined,
      listTools: async () => [],
      prepareTools: async () => [],
      removeTool: async () => undefined,
    } satisfies DesktopBridge;

    renderApp();

    expect(
      await screen.findByText("/documents/Changed Workspace"),
    ).toBeTruthy();
    expect(
      screen.getByRole("dialog", { name: /workspace settings/i }),
    ).toBeTruthy();
  });

  it("settles workspace settings when the desktop path lookup fails", async () => {
    window.history.replaceState(null, "", "/?workspace=settings");
    window.earthStoriesDesktop = {
      version: "9.8.7",
      platform: "linux",
      workspacePath: async () => {
        throw new Error("Workspace path unavailable");
      },
      showWorkspaceFolder: async () => undefined,
      chooseWorkspace: async () => null,
      exportDiagnostics: async () => "cancelled",
      showProjectFolder: async () => undefined,
      openExternal: async () => undefined,
      listTools: async () => [],
      prepareTools: async () => [],
      removeTool: async () => undefined,
    } satisfies DesktopBridge;

    renderApp();

    expect(await screen.findByText("Workspace path unavailable")).toBeTruthy();
    expect(screen.queryByText("Loading workspace…")).toBeNull();
  });

  it("completes prepared-source attachment after failed provisioning retries on the same job", async () => {
    window.history.replaceState(null, "", "/stories/project-one");
    const opened = {
      schema: "earth-stories/project/v1",
      id: "project-one",
      metadata: {
        title: "Retry story",
        description: "",
        author: null,
        created: "2026-08-13T00:00:00.000Z",
        updated: "2026-08-13T00:00:00.000Z",
      },
      basemap: {
        id: "light",
        label: "Light",
        styleUrl: "https://example.com/style.json",
        attribution: null,
      },
      publication: { profile: "connected", theme: "cng" },
      sources: [],
      dataAssets: [
        {
          id: "asset-one",
          label: "relief.tif",
          path: "assets/relief.tif",
          format: "geotiff",
          sizeBytes: 12,
          createdAt: "2026-08-13T00:00:00.000Z",
          preparedSourceId: null,
        },
      ],
      chapters: [
        { id: "chapter-one", type: "prose", title: "Start", narrative: "" },
      ],
    } as const;
    const disclosure = {
      protocol: "earth-stories/conversion/v1",
      requestId: "job-one",
      type: "provisioning-disclosure",
      capability: "raster",
      capabilityName: "Raster preparation",
      versions: ["GDAL 3.12.3", "Rasterio 1.5.0"],
      estimatedBytes: 668_962_511,
      estimateKind: "measured-apparent-installed-footprint",
      destination: "/tools/raster",
      credits: [{ name: "Pixi", license: "BSD-3-Clause" }],
    } as const;
    const snapshot = (status: string, events: unknown[]) => ({
      id: "job-one",
      projectId: "project-one",
      status,
      events,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    });
    let finishInitial!: (value: unknown) => void;
    let finishRetry!: (value: unknown) => void;
    let runningPolls = 0;
    api.openProject.mockResolvedValue(opened);
    api.startConversion.mockResolvedValue(
      snapshot("awaiting-approval", [disclosure]),
    );
    api.actOnConversionJob.mockImplementation(async (_id, action) =>
      action === "retry"
        ? snapshot("awaiting-approval", [disclosure])
        : snapshot("running", [disclosure]),
    );
    conversion.poll.mockImplementation((job, options) => {
      if (job.status === "awaiting-approval")
        return Promise.resolve({ kind: "approval-pending", job });
      runningPolls += 1;
      return new Promise((resolve) => {
        const finish = (value: any) => {
          options.onUpdate(value.job);
          resolve(value);
        };
        if (runningPolls === 1) finishInitial = finish;
        else finishRetry = finish;
      });
    });
    renderApp();
    await screen.findByText("Retry story");
    await userEvent.click(screen.getByRole("button", { name: /story data/i }));
    await userEvent.click(screen.getByRole("button", { name: "Prepare" }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: /install tools and continue/i,
      }),
    );
    finishInitial({
      kind: "completed",
      job: snapshot("failed", [
        disclosure,
        {
          protocol: "earth-stories/conversion/v1",
          requestId: "job-one",
          type: "failure",
          status: "failed",
          code: "runtime-error",
          message: "install failed",
          retryable: true,
          details: {},
        },
      ]),
    });
    await userEvent.click(
      await screen.findByRole("button", { name: /retry tool installation/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: /install tools and continue/i,
      }),
    );
    finishRetry({
      kind: "completed",
      job: snapshot("succeeded", [
        disclosure,
        {
          protocol: "earth-stories/conversion/v1",
          requestId: "job-one",
          type: "failure",
          status: "failed",
          code: "runtime-error",
          message: "install failed",
          retryable: true,
          details: {},
        },
        disclosure,
        {
          protocol: "earth-stories/conversion/v1",
          requestId: "job-one",
          type: "result",
          status: "succeeded",
          output: { path: "assets/prepared/relief.cog.tif", sizeBytes: 100 },
          tools: [{ name: "gdal", version: "3.12.3" }],
          warnings: [],
        },
      ]),
    });

    expect(await screen.findByText("Prepared and ready to use")).toBeTruthy();
    expect(screen.getByText("relief")).toBeTruthy();
    expect(api.startConversion).toHaveBeenCalledOnce();
  });
});
