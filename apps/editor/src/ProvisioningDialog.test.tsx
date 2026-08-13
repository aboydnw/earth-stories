// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProvisioningDialog } from "./ProvisioningDialog";

afterEach(cleanup);

describe("ProvisioningDialog", () => {
  it("discloses installed-size semantics, destination, pins and credits before acknowledgement", async () => {
    const acknowledge = vi.fn();
    render(
      <ProvisioningDialog
        disclosure={{
          protocol: "earth-stories/conversion/v1",
          requestId: "job-1",
          type: "provisioning-disclosure",
          capability: "raster",
          capabilityName: "Raster preparation",
          versions: ["GDAL >=3.10,<4", "Rasterio >=1.4,<2"],
          estimatedBytes: 668_962_511,
          estimateKind: "measured-installed-footprint",
          destination: "/profile/tools/raster",
          credits: [{ name: "Pixi", license: "BSD-3-Clause" }],
        }}
        onAcknowledge={acknowledge}
        onCancel={() => undefined}
      />,
    );

    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).toContain("669 MB on disk");
    expect(text).toContain("not available offline");
    expect(text).toContain("/profile/tools/raster");
    expect(text).toContain("GDAL >=3.10,<4");
    expect(text).toContain("Pixi (BSD-3-Clause)");
    await userEvent.click(
      screen.getByRole("button", { name: "Install tools and continue" }),
    );
    expect(acknowledge).toHaveBeenCalledOnce();
  });
});
