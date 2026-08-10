// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { WorkflowStatusMenu } from "./WorkflowStatusMenu";

afterEach(cleanup);

const stages = [
  { id: "story", label: "Story", state: "complete" as const },
  { id: "chapters", label: "Chapters", state: "complete" as const },
  { id: "data", label: "Data", state: "optional" as const },
  { id: "preview", label: "Preview", state: "complete" as const },
  {
    id: "publish",
    label: "Publish",
    state: "current" as const,
    description: "Needs review",
  },
];

function renderMenu() {
  const onStageSelect = vi.fn();
  const onGuidance = vi.fn();
  render(
    <EarthStoriesProvider>
      <WorkflowStatusMenu
        stages={stages}
        guidance={{
          id: "warning",
          label: "Review warnings",
          message: "One chapter has no narrative.",
          destination: "publish",
          tone: "warning",
        }}
        errors={0}
        warnings={1}
        onStageSelect={onStageSelect}
        onGuidance={onGuidance}
      />
    </EarthStoriesProvider>,
  );
  return { onStageSelect, onGuidance };
}

describe("WorkflowStatusMenu", () => {
  it("keeps the workflow compact until requested", async () => {
    renderMenu();
    expect(
      screen.getByRole("button", { name: /Needs review · 1/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /Needs review · 1/ }),
    );
    expect(
      screen.getByRole("dialog", { name: "Story progress and guidance" }),
    ).toBeTruthy();
  });

  it("closes after stage navigation or guidance", async () => {
    const callbacks = renderMenu();
    await userEvent.click(
      screen.getByRole("button", { name: /Needs review · 1/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Data/ }));
    expect(callbacks.onStageSelect).toHaveBeenCalledWith("data");
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: /Needs review · 1/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Review warnings" }),
    );
    expect(callbacks.onGuidance).toHaveBeenCalledWith("publish");
  });

  it("closes with Escape and restores trigger focus", async () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /Needs review · 1/ });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
