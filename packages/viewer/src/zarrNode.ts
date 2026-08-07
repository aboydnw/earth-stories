import * as zarr from "zarrita";

export type ZarrNode =
  zarr.Group<zarr.Readable> | zarr.Array<zarr.DataType, zarr.Readable>;

export interface OpenedZarrNode {
  node: ZarrNode;
  variable?: string;
  metadata?: Record<string, unknown>;
  dimensions?: string[];
}

function arrayDimensions(
  node: zarr.Array<zarr.DataType, zarr.Readable>,
): Pick<OpenedZarrNode, "dimensions"> {
  return node.dimensionNames ? { dimensions: node.dimensionNames } : {};
}

interface MultiscaleDataset {
  path?: string;
  crs?: string;
  "spatial:transform"?: number[];
  "spatial:shape"?: number[];
}

export function selectMultiscaleDataset(
  datasets: MultiscaleDataset[],
  targetWidth?: number,
) {
  const candidates = datasets.filter(
    (dataset) =>
      dataset.path &&
      dataset.path !== "." &&
      Number.isFinite(dataset["spatial:shape"]?.[1]),
  );
  if (!candidates.length) return datasets[datasets.length - 1];
  if (targetWidth === undefined) return candidates[candidates.length - 1];
  const byWidth = [...candidates].sort(
    (left, right) => left["spatial:shape"]![1] - right["spatial:shape"]![1],
  );
  return (
    byWidth.find((dataset) => dataset["spatial:shape"]![1] >= targetWidth) ??
    byWidth[byWidth.length - 1]
  );
}

export function completeZarrSelection(
  selection: Record<string, number>,
  dimensions: string[],
  spatialDimensions: string[],
  timeDimension: string | null,
  timeIndex: number,
) {
  const complete = { ...selection };
  const spatial = new Set(spatialDimensions);
  for (const dimension of dimensions) {
    if (!spatial.has(dimension) && complete[dimension] === undefined)
      complete[dimension] = 0;
  }
  if (timeDimension) complete[timeDimension] = timeIndex;
  return complete;
}

export async function openZarrVariable(
  href: string,
  variable: string,
  targetWidth?: number,
): Promise<OpenedZarrNode> {
  const store = await zarr.withMaybeConsolidatedMetadata(
    new zarr.FetchStore(href),
  );
  const root = await zarr.open(store, { kind: "group" });
  const rootAttrs = root.attrs as {
    multiscales?: Array<{
      datasets?: MultiscaleDataset[];
    }>;
    "proj:code"?: string;
    "spatial:dimensions"?: string[];
  };
  const levels = rootAttrs.multiscales?.[0]?.datasets ?? [];
  const selectedLevel = selectMultiscaleDataset(levels, targetWidth);
  if (variable && selectedLevel?.path && selectedLevel.path !== ".") {
    try {
      const node = await zarr.open(
        root.resolve(`${selectedLevel.path}/${variable}`),
        { kind: "array" },
      );
      const dimensions = rootAttrs["spatial:dimensions"];
      const transform = selectedLevel["spatial:transform"];
      const shape = selectedLevel["spatial:shape"];
      return {
        node,
        ...arrayDimensions(node),
        metadata:
          dimensions && transform && shape
            ? {
                "spatial:dimensions": dimensions,
                "spatial:transform": transform,
                "spatial:shape": shape,
                "proj:code": selectedLevel.crs ?? rootAttrs["proj:code"],
              }
            : undefined,
      };
    } catch {
      // Some multiscale stores keep the variable at the root; try that next.
    }
  }
  try {
    const node = await zarr.open(root.resolve(variable), { kind: "array" });
    return { node, ...arrayDimensions(node) };
  } catch {
    return { node: root, variable };
  }
}
