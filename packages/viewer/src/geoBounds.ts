export type GeographicBounds = [number, number, number, number];

export function geoJsonBounds(value: unknown): GeographicBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (
      node.length >= 2 &&
      typeof node[0] === "number" &&
      typeof node[1] === "number"
    ) {
      west = Math.min(west, node[0]);
      south = Math.min(south, node[1]);
      east = Math.max(east, node[0]);
      north = Math.max(north, node[1]);
      return;
    }
    node.forEach(visit);
  };
  const collect = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.coordinates) visit(record.coordinates);
    if (record.geometry) collect(record.geometry);
    if (Array.isArray(record.features)) record.features.forEach(collect);
    if (Array.isArray(record.geometries)) record.geometries.forEach(collect);
  };
  collect(value);
  return Number.isFinite(west) ? [west, south, east, north] : null;
}
