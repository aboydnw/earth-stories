// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChapterAddMenu } from "./ChapterAddMenu";

afterEach(cleanup);

describe("ChapterAddMenu", () => {
  it("supports arrow navigation, disabled prerequisites, and selection", async () => {
    const addProse = vi.fn();
    const toggle = vi.fn();
    render(
      <ChapterAddMenu
        open
        canAddImage={false}
        canAddChart={false}
        onToggle={toggle}
        onAddProse={addProse}
        onAddScrolly={() => undefined}
        onAddMap={() => undefined}
        onAddImage={() => undefined}
        onAddVideo={() => undefined}
        onAddChart={() => undefined}
        onAddFlyover={() => undefined}
      />,
    );
    const trigger = screen.getByRole("button", { name: /add chapter/i });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: /text/i }),
    );
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: /flyover/i }),
    );
    expect(
      screen.getByRole("menuitem", { name: /image/i }).hasAttribute("disabled"),
    ).toBe(true);
    await userEvent.keyboard("{Home}{Enter}");
    expect(addProse).toHaveBeenCalledOnce();
  });
});
