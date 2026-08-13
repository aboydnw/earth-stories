import {
  epsgResolver,
  parseWkt,
  type ProjJson,
  type ProjectionDefinition,
} from "@developmentseed/proj";

export interface EmbeddedCogProjection {
  epsg: number;
  definition: string;
}

export type CogProjectionDefinition = ProjectionDefinition | string;

export async function resolveCogProjection(
  crs: number | string | ProjJson,
  embedded: EmbeddedCogProjection | null,
  resolveEpsg: (epsg: number) => Promise<ProjectionDefinition> = epsgResolver,
): Promise<CogProjectionDefinition> {
  if (typeof crs !== "number") return parseWkt(crs);
  if (embedded?.epsg === crs) return embedded.definition;
  return resolveEpsg(crs);
}
