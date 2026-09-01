import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const creditsRoot = resolve("apps/viewer/public/credits/runtime");
const sbom = resolve("docs/release/offline-runtime-sbom.md");

const required = [
  "DUCKDB_LICENSE",
  "DUCKDB_WASM_LICENSE",
  "DUCKDB_SPATIAL_LICENSE",
  "GDAL_LICENSE",
  "GEOS_LICENSE",
  "PROJ_LICENSE",
  "LIBTIFF_LICENSE",
  "LIBJPEG_TURBO_LICENSE",
  "NLOHMANN_JSON_LICENSE",
  "EXPAT_LICENSE",
  "ZLIB_LICENSE",
  "LIBDEFLATE_LICENSE",
  "LIBGEOTIFF_LICENSE",
  "JSON_C_LICENSE",
  "LERC_LICENSE",
] as const;

it("ships a non-empty notice payload for every inventoried runtime component", async () => {
  for (const name of required) {
    const path = resolve(creditsRoot, name);
    expect((await stat(path)).size, name).toBeGreaterThan(200);
  }
});

it("keeps the copyleft component's full license text with the runtime", async () => {
  const geos = await readFile(resolve(creditsRoot, "GEOS_LICENSE"), "utf8");
  expect(geos).toContain("GNU LESSER GENERAL PUBLIC LICENSE");
  expect(geos).toContain("Version 2.1, February 1999");
});

it("names every shipped notice file in the runtime SBOM", async () => {
  const inventory = await readFile(sbom, "utf8");
  for (const name of required) {
    expect(inventory, name).toContain(`credits/runtime/${name}`);
  }
});
