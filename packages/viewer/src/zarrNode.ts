import * as zarr from "zarrita";

export type ZarrNode =
  zarr.Group<zarr.Readable> | zarr.Array<zarr.DataType, zarr.Readable>;

export interface OpenedZarrNode {
  node: ZarrNode;
  variable?: string;
  metadata?: Record<string, unknown>;
}

export async function openZarrVariable(
  href: string,
  variable: string,
): Promise<OpenedZarrNode> {
  const store = await zarr.withMaybeConsolidatedMetadata(
    new zarr.FetchStore(href),
  );
  const root = await zarr.open(store, { kind: "group" });
  const rootAttrs = root.attrs as {
    multiscales?: Array<{
      datasets?: Array<{
        path?: string;
        crs?: string;
        "spatial:transform"?: number[];
        "spatial:shape"?: number[];
      }>;
    }>;
    "proj:code"?: string;
    "spatial:dimensions"?: string[];
  };
  const levels = rootAttrs.multiscales?.[0]?.datasets ?? [];
  const coarsest = levels[levels.length - 1];
  if (variable && coarsest?.path && coarsest.path !== ".") {
    try {
      const node = await zarr.open(
        root.resolve(`${coarsest.path}/${variable}`),
        { kind: "array" },
      );
      const dimensions = rootAttrs["spatial:dimensions"];
      const transform = coarsest["spatial:transform"];
      const shape = coarsest["spatial:shape"];
      return {
        node,
        metadata:
          dimensions && transform && shape
            ? {
                "spatial:dimensions": dimensions,
                "spatial:transform": transform,
                "spatial:shape": shape,
                "proj:code": coarsest.crs ?? rootAttrs["proj:code"],
              }
            : undefined,
      };
    } catch {
      // Some multiscale stores keep the variable at the root; try that next.
    }
  }
  try {
    const node = await zarr.open(root.resolve(variable), { kind: "array" });
    return { node };
  } catch {
    return { node: root, variable };
  }
}
