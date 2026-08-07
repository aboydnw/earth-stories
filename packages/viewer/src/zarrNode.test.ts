import { beforeEach, describe, expect, it, vi } from "vitest";
import * as zarr from "zarrita";
import { openZarrVariable } from "./zarrNode.js";

vi.mock("zarrita", () => ({
  FetchStore: class FetchStore {
    constructor(public href: string) {}
  },
  withMaybeConsolidatedMetadata: vi.fn(async (store) => store),
  open: vi.fn(),
}));

describe("openZarrVariable", () => {
  const open = vi.mocked(zarr.open);
  const root = {
    attrs: {},
    resolve: vi.fn(() => ({ path: "precipitation" })),
  };
  const array = { shape: [2, 3] };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pre-opens a single-array variable and omits the variable prop", async () => {
    open
      .mockResolvedValueOnce(root as never)
      .mockResolvedValueOnce(array as never);

    await expect(
      openZarrVariable("https://example.test/a.zarr", "precipitation"),
    ).resolves.toEqual({ node: array });
    expect(root.resolve).toHaveBeenCalledWith("precipitation");
  });

  it("falls back to group-plus-variable stores", async () => {
    open
      .mockResolvedValueOnce(root as never)
      .mockRejectedValueOnce(new Error("not an array"));

    await expect(
      openZarrVariable("https://example.test/a.zarr", "precipitation"),
    ).resolves.toEqual({ node: root, variable: "precipitation" });
  });

  it("opens the coarsest array from a multiscale pyramid", async () => {
    const multiscaleRoot = {
      attrs: {
        "proj:code": "EPSG:4326",
        "spatial:dimensions": ["y", "x"],
        multiscales: [
          {
            datasets: [
              { path: ".", "spatial:shape": [1000, 2000] },
              {
                path: "16x",
                crs: "EPSG:4326",
                "spatial:shape": [64, 128],
                "spatial:transform": [1, 0, -180, 0, -1, 90],
              },
            ],
          },
        ],
      },
      resolve: vi.fn((path: string) => ({ path })),
    };
    open
      .mockResolvedValueOnce(multiscaleRoot as never)
      .mockResolvedValueOnce(array as never);

    const result = await openZarrVariable(
      "https://example.test/a.zarr",
      "variables",
    );

    expect(multiscaleRoot.resolve).toHaveBeenCalledWith("16x/variables");
    expect(result.node).toBe(array);
    expect(result.metadata?.["spatial:shape"]).toEqual([64, 128]);
  });
});
