// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "./desktop";
import { DesktopToolsPanel } from "./DesktopToolsPanel";

afterEach(cleanup);

describe("DesktopToolsPanel", () => {
  it("lists actual installed bytes and removes a capability through the desktop bridge", async () => {
    const removeTool = vi.fn(async () => undefined);
    const listTools = vi
      .fn()
      .mockResolvedValueOnce([
        {
          capability: "raster",
          apparentBytes: 668_962_511,
          destination: "/tools/raster",
        },
      ])
      .mockResolvedValueOnce([]);
    const desktop = {
      listTools,
      prepareTools: vi.fn(),
      removeTool,
    } as unknown as DesktopBridge;
    render(<DesktopToolsPanel desktop={desktop} />);

    expect(await screen.findByText("669 MB apparent file size")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove raster tools" }),
    );
    expect(removeTool).toHaveBeenCalledWith("raster");
    expect(
      await screen.findByText("No conversion tools installed."),
    ).toBeTruthy();
  });

  it("discloses missing pinned environments and prepares only the selected capabilities", async () => {
    const installedCore = {
      capability: "core",
      apparentBytes: 321_000_000,
      destination: "/tools/core",
    };
    const installedRaster = {
      capability: "raster",
      apparentBytes: 669_000_000,
      destination: "/tools/raster",
    };
    const listTools = vi.fn().mockResolvedValueOnce([installedCore]);
    const prepareTools = vi.fn(async () => [installedCore, installedRaster]);
    const desktop = {
      listTools,
      prepareTools,
      removeTool: vi.fn(),
    } as unknown as DesktopBridge;
    render(<DesktopToolsPanel desktop={desktop} />);

    expect(await screen.findByText("Core data inspection")).toBeTruthy();
    expect(screen.getByText("Installed")).toBeTruthy();
    expect(screen.getByText("Raster preparation")).toBeTruthy();
    expect(screen.getAllByText("Needs download").length).toBeGreaterThan(0);
    expect(
      screen
        .getByRole("button", {
          name: "Prepare this computer for offline work",
        })
        .hasAttribute("disabled"),
    ).toBe(true);

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Raster preparation/ }),
    );
    expect(screen.getByText(/669 MB selected/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Prepare this computer for offline work",
      }),
    );

    expect(prepareTools).toHaveBeenCalledWith(["raster"]);
    expect(await screen.findAllByText("Installed")).toHaveLength(2);
  });

  it("reports an installed-tool scan failure without an unhandled rejection", async () => {
    const desktop = {
      listTools: vi.fn().mockRejectedValue(new Error("Tool scan failed")),
      prepareTools: vi.fn(),
      removeTool: vi.fn(),
    } as unknown as DesktopBridge;

    render(<DesktopToolsPanel desktop={desktop} />);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Tool scan failed",
    );
  });
});
