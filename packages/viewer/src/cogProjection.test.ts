import { describe, expect, it } from "vitest";
import { resolveCogProjection } from "./cogProjection.js";

describe("resolveCogProjection", () => {
  it("uses a matching embedded numeric-CRS definition without a resolver request", async () => {
    const definition =
      "+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs +type=crs";

    await expect(
      resolveCogProjection(32618, { epsg: 32618, definition }, async () => {
        throw new Error("epsg.io must not be requested");
      }),
    ).resolves.toBe(definition);
  });
});
