// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  ConfirmDialog,
  CollapsibleSection,
  EarthStoriesProvider,
  FormField,
  IconButton,
  GuidancePrompt,
  ReadinessSummary,
  TextInput,
  WorkflowGuide,
} from "./index";

afterEach(cleanup);
let consoleError: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  const original = console.error;
  consoleError = vi
    .spyOn(console, "error")
    .mockImplementation((message, ...rest) => {
      if (message === "Could not parse CSS stylesheet") return;
      original(message, ...rest);
    });
});
afterAll(() => consoleError.mockRestore());

function product(ui: ReactNode) {
  return render(<EarthStoriesProvider>{ui}</EarthStoriesProvider>);
}

describe("shared product controls", () => {
  it("associates field help and validation with its control", () => {
    product(
      <FormField
        label="Dataset URL"
        hint="Use a public HTTPS address."
        error="The address is not valid."
      >
        <TextInput />
      </FormField>,
    );
    const input = screen.getByRole("textbox", { name: "Dataset URL" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toHaveLength(2);
    expect(screen.getByText("Use a public HTTPS address.")).toBeTruthy();
    expect(screen.getByText("The address is not valid.")).toBeTruthy();
  });

  it("passes native field state through without discarding caller semantics", () => {
    product(
      <FormField label="Dataset URL" hint="Use HTTPS." required>
        <TextInput
          aria-describedby="external-help"
          aria-invalid
          data-testid="dataset-url"
        />
      </FormField>,
    );
    const input = screen.getByTestId("dataset-url");
    expect(input.getAttribute("required")).not.toBeNull();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toEqual([
      "external-help",
      `${input.id}-hint`,
    ]);
  });

  it("gives icon-only actions an accessible name", () => {
    product(<IconButton label="Remove source">×</IconButton>);
    expect(screen.getByRole("button", { name: "Remove source" })).toBeTruthy();
  });

  it("keeps destructive confirmation explicit", async () => {
    const confirm = vi.fn();
    product(
      <ConfirmDialog
        open
        title="Remove River survey?"
        description="The story remains recoverable in local trash."
        confirmLabel="Remove story"
        onConfirm={confirm}
        onOpenChange={() => undefined}
      />,
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Remove story" }));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("renders workflow stages as ordered, actionable navigation", async () => {
    const select = vi.fn();
    product(
      <WorkflowGuide
        stages={[
          { id: "story", label: "Story", state: "complete" },
          { id: "data", label: "Data", state: "optional" },
          { id: "preview", label: "Preview", state: "current" },
        ]}
        onStageSelect={select}
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Authoring progress" }),
    ).toBeTruthy();
    expect(document.querySelector("ol")?.children).toHaveLength(3);
    expect(
      screen
        .getByRole("button", { name: /Preview/ })
        .getAttribute("aria-current"),
    ).toBe("step");
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(select).toHaveBeenCalledWith("story");
  });

  it("keeps guidance to one primary action and exposes readiness counts", () => {
    product(
      <>
        <GuidancePrompt actionLabel="Review preview" onAction={() => undefined}>
          The saved story changed after your last review.
        </GuidancePrompt>
        <ReadinessSummary status="review" errors={12} warnings={23} stale />
      </>,
    );
    expect(screen.getByRole("button", { name: "Review preview" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("12 errors")).toBeTruthy();
    expect(screen.getByText("23 warnings")).toBeTruthy();
    expect(screen.getByText(/refresh required/)).toBeTruthy();
  });

  it("summarizes collapsed settings, exposes issues, and preserves field values", async () => {
    product(
      <CollapsibleSection
        title="Layers"
        description="Sources drawn above the main map"
        summary="2 overlays"
        issue="Needs attention"
        defaultOpen
      >
        <TextInput aria-label="Layer label" defaultValue="Flood extent" />
      </CollapsibleSection>,
    );
    const trigger = screen.getByRole("button", { name: /Layers/ });
    expect(trigger.textContent).toContain("2 overlays");
    expect(trigger.textContent).toContain("Needs attention");
    expect(screen.getByText("Sources drawn above the main map")).toBeTruthy();

    await userEvent.clear(screen.getByRole("textbox", { name: "Layer label" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Layer label" }),
      "Observed flood",
    );
    await userEvent.click(trigger);
    await userEvent.click(trigger);

    expect(
      (screen.getByRole("textbox", { name: "Layer label" }) as HTMLInputElement)
        .value,
    ).toBe("Observed flood");
  });
});
