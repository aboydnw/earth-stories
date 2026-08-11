// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import {
  createDefaultSourceProvenance,
  type ProjectSource,
} from "@earth-stories/story-schema";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { SourcePresentationFields } from "./SourcePresentationFields";

afterEach(cleanup);

function Example() {
  const [source, setSource] = useState<ProjectSource>({
    id: "places",
    kind: "local-geojson",
    label: "Places",
    path: "data/places.geojson",
    attribution: null,
    sizeBytes: 1,
    delivery: "included",
    provenance: createDefaultSourceProvenance(),
  });
  return (
    <>
      <SourcePresentationFields source={source} onChange={setSource} />
      <output data-testid="category-colors">
        {JSON.stringify(source.presentation?.categoryColors ?? {})}
      </output>
    </>
  );
}

describe("SourcePresentationFields", () => {
  it("keeps invalid category colors local and recovers with valid pairs", async () => {
    render(
      <EarthStoriesProvider>
        <Example />
      </EarthStoriesProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /filtering and legend/i }),
    );
    const input = screen.getByRole("textbox", { name: "Category colors" });
    await userEvent.type(input, "forest=green");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("category-colors").textContent).toBe("{}");
    fireEvent.change(input, { target: { value: "forest=#228833=extra" } });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("category-colors").textContent).toBe("{}");
    await userEvent.clear(input);
    await userEvent.type(input, "forest=#228833");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByTestId("category-colors").textContent).toBe(
      JSON.stringify({ forest: ["#", "228833"].join("") }),
    );
  });
});
