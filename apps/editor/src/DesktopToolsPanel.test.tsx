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
    const desktop = { listTools, removeTool } as unknown as DesktopBridge;
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
});
