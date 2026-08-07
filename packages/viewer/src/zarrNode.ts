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
    const node = await zarr.open(root.resolve(`${coarsest.path}/${variable}`), {
      kind: "array",
    });
    return {
      node,
      metadata: {
        "spatial:dimensions": rootAttrs["spatial:dimensions"],
        "spatial:transform": coarsest["spatial:transform"],
        "spatial:shape": coarsest["spatial:shape"],
        "proj:code": coarsest.crs ?? rootAttrs["proj:code"],
      },
    };
  }
  try {
    const node = await zarr.open(root.resolve(variable), { kind: "array" });
    return { node };
  } catch {
    return { node: root, variable };
  }
}
