// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthoringReadiness } from "@earth-stories/publisher/readiness";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { PublishMenu } from "./PublishMenu";

afterEach(cleanup);
const local: AuthoringReadiness = {
  manifest: {} as AuthoringReadiness["manifest"] & object,
  findings: [
    {
      id: "warning",
      area: "publish",
      severity: "warning",
      message: "Review attribution",
    },
  ],
  stages: {
    story: "complete",
    chapters: "complete",
    data: "optional",
    preview: "complete",
    publish: "current",
    sharing: "current",
  },
};

function menu(overrides: Partial<Parameters<typeof PublishMenu>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    localReadiness: local,
    serverReadiness: {
      status: "idle",
      result: null,
      error: null,
      key: null,
    } as const,
    chapterCount: 2,
    sourceCount: 0,
    previewReviewed: false,
    onLoadReadiness: vi.fn(),
    onPreview: vi.fn(),
    onPublish: vi.fn(),
    ...overrides,
  };
  render(
    <EarthStoriesProvider>
      <PublishMenu {...props} />
    </EarthStoriesProvider>,
  );
  return props;
}

describe("PublishMenu", () => {
  it("keeps warning-only preview available and loads checks", async () => {
    const props = menu();
    expect(props.onLoadReadiness).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Publish, 1 issue" }),
    ).toBeTruthy();
    const preview = screen.getByRole("menuitem", { name: /See as a reader/ });
    expect(preview.getAttribute("disabled")).toBeNull();
    await userEvent.click(preview);
    expect(props.onPreview).toHaveBeenCalledOnce();
  });

  it("opens blocked publication details instead of disabling publish", async () => {
    const props = menu({
      localReadiness: {
        ...local,
        findings: [
          {
            id: "broken",
            area: "data",
            severity: "error",
            message: "Missing data",
          },
        ],
      },
    });
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Publish publicly/ }),
    );
    expect(props.onPublish).toHaveBeenCalledOnce();
  });

  it("supports Escape, arrow navigation, and focus return", async () => {
    const props = menu();
    await userEvent.keyboard("{ArrowDown}{Escape}");
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^Publish/ }),
    );
  });
});
