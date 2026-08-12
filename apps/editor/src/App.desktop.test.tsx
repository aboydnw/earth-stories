// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { DesktopBridge } from "./desktop";

const api = vi.hoisted(() => ({
  getExamples: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getExamples: api.getExamples,
  listProjects: api.listProjects,
}));

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
});

afterEach(() => {
  cleanup();
  delete window.earthStoriesDesktop;
  vi.clearAllMocks();
});

describe("desktop editor controls", () => {
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
      showProjectFolder: async (projectId) => {
        revealedProjectIds.push(projectId);
      },
      openExternal: async () => undefined,
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
});
