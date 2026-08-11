// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChapterAddMenu } from "./ChapterAddMenu";

afterEach(cleanup);

describe("ChapterAddMenu", () => {
  it("supports arrow navigation, the nested group, and selection", async () => {
    const addProse = vi.fn();
    const toggle = vi.fn();
    render(
      <ChapterAddMenu
        open
        canAddMap={false}
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
      screen.getByRole("menuitem", { name: /more chapter types/i }),
    );
    expect(screen.queryByRole("menuitem", { name: /^video/i })).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: /^map/i }).hasAttribute("disabled"),
    ).toBe(true);
    const more = screen.getByRole("menuitem", {
      name: /more chapter types/i,
    });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await userEvent.keyboard("{Enter}");
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: /^flyover/i })).toBeTruthy();
    await userEvent.keyboard("{Home}{Enter}");
    expect(addProse).toHaveBeenCalledOnce();
  });

  it("routes missing media prerequisites to data instead of a disabled choice", async () => {
    const addData = vi.fn();
    render(
      <ChapterAddMenu
        open
        canAddMap={false}
        canAddImage={false}
        canAddChart={false}
        onToggle={() => undefined}
        onAddDataForType={addData}
        onAddProse={() => undefined}
        onAddScrolly={() => undefined}
        onAddMap={() => undefined}
        onAddImage={() => undefined}
        onAddVideo={() => undefined}
        onAddChart={() => undefined}
        onAddFlyover={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole("menuitem", { name: /image/i }));
    expect(addData).toHaveBeenCalledWith("image");
    await userEvent.click(screen.getByRole("menuitem", { name: /^map/i }));
    expect(addData).toHaveBeenCalledWith("map");
    await userEvent.click(
      screen.getByRole("menuitem", { name: /guided tour/i }),
    );
    expect(addData).toHaveBeenCalledWith("scrolly");
  });
});
