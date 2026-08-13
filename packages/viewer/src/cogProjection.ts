import {
  epsgResolver,
  parseWkt,
  type ProjJson,
  type ProjectionDefinition,
} from "@developmentseed/proj";
import proj4 from "proj4";

export interface EmbeddedCogProjection {
  epsg: number;
  definition: string;
}

export type CogProjectionDefinition = ProjectionDefinition | string;

export function cogPreparationKey({
  url,
  rasterBand,
  rescaleMin,
  rescaleMax,
  projection,
  projectionDefinitions = [],
  offline = false,
}: {
  url: string;
  rasterBand: number;
  rescaleMin: number | null;
  rescaleMax: number | null;
  projection: EmbeddedCogProjection | null;
  projectionDefinitions?: EmbeddedCogProjection[];
  offline?: boolean;
}): string {
  return JSON.stringify([
    url,
    rasterBand,
    rescaleMin,
    rescaleMax,
    projection?.epsg ?? null,
    projection?.definition ?? null,
    projectionDefinitions,
    offline,
  ]);
}

export async function resolveCogProjection(
  crs: number | string | ProjJson,
  embedded: EmbeddedCogProjection | null,
  resolveEpsg: (epsg: number) => Promise<ProjectionDefinition> = epsgResolver,
  projectionDefinitions: EmbeddedCogProjection[] = [],
  offline = false,
): Promise<CogProjectionDefinition> {
  if (typeof crs !== "number") return parseWkt(crs);
  if (embedded) {
    if (embedded.epsg !== crs)
      throw new Error(
        `Embedded projection EPSG:${embedded.epsg} does not match the COG CRS EPSG:${crs}.`,
      );
    return embedded.definition;
  }
  const manifestDefinition = projectionDefinitions.find(
    (definition) => definition.epsg === crs,
  );
  if (manifestDefinition) return manifestDefinition.definition;
  if (offline)
    throw new Error(`EPSG:${crs} is not included in this offline publication.`);
  return resolveEpsg(crs);
}

export async function resolveCogLayerProjection(
  epsg: number,
  embedded: EmbeddedCogProjection | null,
  resolveEpsg: (epsg: number) => Promise<ProjectionDefinition> = epsgResolver,
): Promise<ProjectionDefinition> {
  const definition = await resolveCogProjection(epsg, embedded, resolveEpsg);
  if (typeof definition !== "string") return definition;
  const projection = new proj4.Proj(
    definition,
  ) as unknown as ProjectionDefinition;
  return Object.assign(projection, { title: `EPSG:${epsg}` });
}
