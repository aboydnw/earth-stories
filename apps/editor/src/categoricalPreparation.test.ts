import { describe, expect, it } from "vitest";
import { categoricalPresentation } from "./categoricalPreparation.js";

describe("categoricalPresentation", () => {
  it("returns null when the worker reported no categories", () => {
    expect(categoricalPresentation({ path: "/x.tif" })).toBeNull();
    expect(
      categoricalPresentation({ path: "/x.tif", categories: [] }),
    ).toBeNull();
  });

  it("maps categories to colours and a rescale spanning the class values", () => {
    const patch = categoricalPresentation({
      categories: [
        { value: 1, color: "#4E79A7", label: "Water" },
        { value: 7, color: "#F28E2B", label: "Class 7" },
      ],
    });

    expect(patch).toEqual({
      categoryColors: { "1": "#4e79a7", "7": "#f28e2b" },
      rescale: [1, 7],
      legendTitle: "",
    });
  });

  it("widens the rescale when every class shares one value", () => {
    expect(
      categoricalPresentation({
        categories: [{ value: 3, color: "#4E79A7", label: "Class 3" }],
      })?.rescale,
    ).toEqual([3, 4]);
  });

  it("drops malformed entries", () => {
    expect(
      categoricalPresentation({ categories: [{ value: "a", color: "red" }] }),
    ).toBeNull();
  });
});
