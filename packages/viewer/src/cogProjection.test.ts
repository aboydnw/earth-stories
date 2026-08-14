import { describe, expect, it } from "vitest";
import {
  cogPreparationKey,
  resolveCogLayerProjection,
  resolveCogProjection,
} from "./cogProjection.js";

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

  it("fails closed when embedded metadata does not match the numeric COG CRS", async () => {
    await expect(
      resolveCogProjection(
        32618,
        { epsg: 4326, definition: "+proj=longlat +datum=WGS84" },
        async () => {
          throw new Error("the legacy resolver must not run");
        },
      ),
    ).rejects.toThrow("does not match the COG CRS EPSG:32618");
  });

  it("changes preparation identity when embedded projection metadata changes", () => {
    const first = cogPreparationKey({
      url: "https://story.test/data.tif",
      rasterBand: 1,
      rescaleMin: null,
      rescaleMax: null,
      projection: { epsg: 32618, definition: "+proj=utm +zone=18" },
    });
    const second = cogPreparationKey({
      url: "https://story.test/data.tif",
      rasterBand: 1,
      rescaleMin: null,
      rescaleMax: null,
      projection: { epsg: 32619, definition: "+proj=utm +zone=19" },
    });

    expect(second).not.toBe(first);
  });

  it("adapts an embedded proj4 string for the COG layer without a resolver request", async () => {
    const projection = await resolveCogLayerProjection(
      32618,
      {
        epsg: 32618,
        definition:
          "+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs +type=crs",
      },
      async () => {
        throw new Error("epsg.io must not be requested");
      },
    );

    expect(projection.projName).toBe("utm");
    expect(projection.zone).toBe(18);
    expect(projection.units).toBe("m");
  });

  it("uses a manifest projection before the remote resolver", async () => {
    await expect(
      resolveCogProjection(
        32618,
        null,
        async () => {
          throw new Error("remote resolver called");
        },
        [{ epsg: 32618, definition: "+proj=utm +zone=18" }],
        true,
      ),
    ).resolves.toBe("+proj=utm +zone=18");
  });

  it("uses a manifest projection in the deck COG layer resolver", async () => {
    const projection = await resolveCogLayerProjection(
      32618,
      null,
      async () => {
        throw new Error("remote resolver called");
      },
      [{ epsg: 32618, definition: "+proj=utm +zone=18" }],
      true,
    );

    expect(projection.projName).toBe("utm");
    expect(projection.zone).toBe(18);
  });

  it("reports unsupported CRS without a remote request in offline mode", async () => {
    const resolver = async () => {
      throw new Error("remote resolver called");
    };
    await expect(
      resolveCogProjection(32619, null, resolver, [], true),
    ).rejects.toThrow("EPSG:32619 is not included in this offline publication");
  });
});
