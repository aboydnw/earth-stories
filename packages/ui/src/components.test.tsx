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
  EarthStoriesProvider,
  FormField,
  IconButton,
  TextInput,
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
});
