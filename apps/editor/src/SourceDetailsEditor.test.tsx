// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultSourceProvenance,
  type ProjectSource,
} from "@earth-stories/story-schema";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { SourceDetailsEditor } from "./SourceDetailsEditor";

afterEach(cleanup);

describe("SourceDetailsEditor", () => {
  it("makes shared scope explicit before editing source identity", async () => {
    const change = vi.fn();
    const source = {
      id: "coast",
      kind: "local-geojson",
      label: "Coastline",
      path: "data/coast.geojson",
      delivery: "included",
      attribution: null,
      sizeBytes: 20,
      provenance: createDefaultSourceProvenance(),
    } as unknown as ProjectSource;
    render(
      <EarthStoriesProvider>
        <SourceDetailsEditor
          source={source}
          chapterTitles={["Opening map", "Coastal change"]}
          onChange={change}
          onClose={() => undefined}
        />
      </EarthStoriesProvider>,
    );
    expect(
      screen.getByText(/affects every chapter using this source/i),
    ).toBeTruthy();
    expect(screen.getByText(/Opening map/)).toBeTruthy();
    const label = screen.getByRole("textbox", { name: "Source label" });
    await userEvent.clear(label);
    await userEvent.type(label, "Updated coast");
    expect(change).toHaveBeenCalled();
  });
});
