import { beforeEach, describe, expect, it, vi } from "vitest";
import * as zarr from "zarrita";
import {
  completeZarrSelection,
  openZarrVariable,
  selectMultiscaleDataset,
} from "./zarrNode.js";

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

  it("leaves metadata undefined when a multiscale level lacks georeferencing", async () => {
    const multiscaleRoot = {
      attrs: { multiscales: [{ datasets: [{ path: "16x" }] }] },
      resolve: vi.fn((path: string) => ({ path })),
    };
    open
      .mockResolvedValueOnce(multiscaleRoot as never)
      .mockResolvedValueOnce(array as never);

    await expect(
      openZarrVariable("https://example.test/a.zarr", "variables"),
    ).resolves.toEqual({ node: array, metadata: undefined });
  });

  it("falls back to the root variable when a multiscale path is missing", async () => {
    const multiscaleRoot = {
      attrs: { multiscales: [{ datasets: [{ path: "16x" }] }] },
      resolve: vi.fn((path: string) => ({ path })),
    };
    open
      .mockResolvedValueOnce(multiscaleRoot as never)
      .mockRejectedValueOnce(new Error("missing overview variable"))
      .mockResolvedValueOnce(array as never);

    await expect(
      openZarrVariable("https://example.test/a.zarr", "variables"),
    ).resolves.toEqual({ node: array });
    expect(multiscaleRoot.resolve).toHaveBeenNthCalledWith(1, "16x/variables");
    expect(multiscaleRoot.resolve).toHaveBeenNthCalledWith(2, "variables");
  });
});

describe("selectMultiscaleDataset", () => {
  const datasets = [
    { path: ".", "spatial:shape": [16_000, 32_000] },
    { path: "32x", "spatial:shape": [500, 1_000] },
    { path: "16x", "spatial:shape": [1_000, 2_000] },
    { path: "64x", "spatial:shape": [250, 500] },
  ];

  it("chooses the smallest overview that satisfies the viewport width", () => {
    expect(selectMultiscaleDataset(datasets, 1_200)?.path).toBe("16x");
    expect(selectMultiscaleDataset(datasets, 400)?.path).toBe("64x");
  });

  it("caps at the most detailed available overview", () => {
    expect(selectMultiscaleDataset(datasets, 8_000)?.path).toBe("16x");
  });
});

describe("completeZarrSelection", () => {
  it("pins omitted non-spatial dimensions and preserves explicit choices", () => {
    expect(
      completeZarrSelection(
        { band: 2 },
        ["time", "band", "latitude", "longitude"],
        ["latitude", "longitude"],
        "time",
        7,
      ),
    ).toEqual({ time: 7, band: 2 });
  });
});
