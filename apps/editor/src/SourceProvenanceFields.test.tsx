// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSourceProvenance } from "@earth-stories/story-schema";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { SourceProvenanceFields } from "./SourceProvenanceFields";

afterEach(cleanup);

describe("SourceProvenanceFields", () => {
  it("supports partial values, clearing fields, and ordered transformations", async () => {
    const change = vi.fn();
    render(
      <EarthStoriesProvider>
        <SourceProvenanceFields
          value={{
            ...defaultSourceProvenance,
            publisher: "USGS",
            transformations: ["Clip", "Reproject"],
          }}
          onChange={change}
        />
      </EarthStoriesProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Source and provenance" }),
    );
    const publisher = screen.getByRole("textbox", { name: "Publisher" });
    await userEvent.clear(publisher);
    expect(change).toHaveBeenCalledWith(
      expect.objectContaining({ publisher: null }),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Transformations",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Clip\nReproject");
  });

  it("labels invalid URLs and dates accessibly", async () => {
    render(
      <EarthStoriesProvider>
        <SourceProvenanceFields
          value={{
            ...defaultSourceProvenance,
            sourceUrl: "bad" as never,
            dataUpdatedAt: "2026-02-30",
            accessedAt: "2026-13-01",
          }}
          onChange={() => undefined}
        />
      </EarthStoriesProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Source and provenance" }),
    );
    expect(
      screen
        .getByRole("textbox", { name: "Source URL" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      screen
        .getByRole("textbox", { name: "Data updated" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      screen
        .getByRole("textbox", { name: "Accessed" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("accepts real leap days and rejects non-leap-year boundaries", async () => {
    render(
      <EarthStoriesProvider>
        <SourceProvenanceFields
          value={{
            ...defaultSourceProvenance,
            dataUpdatedAt: "2024-02-29",
            accessedAt: "2023-02-29",
          }}
          onChange={() => undefined}
        />
      </EarthStoriesProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Source and provenance" }),
    );
    expect(
      screen
        .getByRole("textbox", { name: "Data updated" })
        .getAttribute("aria-invalid"),
    ).toBeNull();
    expect(
      screen
        .getByRole("textbox", { name: "Accessed" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
  });
});
