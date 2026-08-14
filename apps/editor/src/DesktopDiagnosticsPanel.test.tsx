// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "./desktop";
import { DesktopDiagnosticsPanel } from "./DesktopDiagnosticsPanel";

afterEach(cleanup);

describe("DesktopDiagnosticsPanel", () => {
  it("exports without exposing a path or file contents to the renderer", async () => {
    const exportDiagnostics = vi.fn(async () => "exported" as const);
    const desktop = { exportDiagnostics } as unknown as DesktopBridge;
    render(<DesktopDiagnosticsPanel desktop={desktop} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Export diagnostics" }),
    );

    expect(exportDiagnostics).toHaveBeenCalledOnce();
    expect(
      await screen.findByText(
        "Diagnostics exported and revealed in your file browser.",
      ),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("/");
  });

  it("reports cancellation and failure accessibly without raw errors", async () => {
    const exportDiagnostics = vi
      .fn<DesktopBridge["exportDiagnostics"]>()
      .mockResolvedValueOnce("cancelled")
      .mockRejectedValueOnce(new Error("/secret/path?token=secret"));
    const desktop = { exportDiagnostics } as unknown as DesktopBridge;
    render(<DesktopDiagnosticsPanel desktop={desktop} />);
    const button = screen.getByRole("button", { name: "Export diagnostics" });

    await userEvent.click(button);
    expect(
      await screen.findByText("Diagnostics export cancelled."),
    ).toBeTruthy();
    await userEvent.click(button);
    expect(
      await screen.findByText("Diagnostics could not be exported."),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("secret");
  });
});
