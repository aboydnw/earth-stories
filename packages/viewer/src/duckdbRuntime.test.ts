import { describe, expect, it } from "vitest";
import {
  duckDbSpatialSetupSql,
  publicationDuckDbRuntime,
} from "./duckdbRuntime.js";

describe("publicationDuckDbRuntime", () => {
  it("resolves every runtime locator beneath the publication origin and path", () => {
    expect(
      publicationDuckDbRuntime(
        new URL("https://stories.example/field-notes/index.html"),
      ),
    ).toEqual({
      bundles: {
        mvp: {
          mainModule:
            "https://stories.example/field-notes/runtime/duckdb/duckdb-mvp.wasm",
          mainWorker:
            "https://stories.example/field-notes/runtime/duckdb/duckdb-browser-mvp.worker.js",
        },
        eh: {
          mainModule:
            "https://stories.example/field-notes/runtime/duckdb/duckdb-eh.wasm",
          mainWorker:
            "https://stories.example/field-notes/runtime/duckdb/duckdb-browser-eh.worker.js",
        },
      },
      extensionRepository:
        "https://stories.example/field-notes/runtime/duckdb/extensions",
    });
  });

  it("sets the mirrored extension repository before loading spatial", () => {
    expect(
      duckDbSpatialSetupSql(
        "https://stories.example/author's/runtime/duckdb/extensions",
      ),
    ).toBe(
      "SET custom_extension_repository = 'https://stories.example/author''s/runtime/duckdb/extensions'; INSTALL spatial; LOAD spatial;",
    );
  });

  it("fails closed when an offline manifest omits a required runtime asset", () => {
    expect(() =>
      publicationDuckDbRuntime(
        new URL("https://stories.example/story/index.html"),
        [],
        true,
      ),
    ).toThrow("Offline GeoParquet runtime is incomplete");
  });

  it("uses manifest runtime asset locators for an offline publication", () => {
    const names = [
      "duckdb-browser-mvp.worker.js",
      "duckdb-mvp.wasm",
      "duckdb-browser-eh.worker.js",
      "duckdb-eh.wasm",
      "parquet-mvp",
      "spatial-mvp",
      "parquet-eh",
      "spatial-eh",
    ];
    const runtime = publicationDuckDbRuntime(
      new URL("https://stories.example/story/index.html"),
      names.map((name) => ({
        id: `runtime:duckdb:${name}`,
        href:
          name.includes("parquet") || name.includes("spatial")
            ? `local/extensions/v1.4.3/${name}.wasm`
            : `local/${name}`,
        sha256: "a".repeat(64),
      })),
      true,
    );

    expect(runtime.bundles.mvp.mainModule).toBe(
      "https://stories.example/story/local/duckdb-mvp.wasm",
    );
    expect(runtime.bundles.eh.mainWorker).toBe(
      "https://stories.example/story/local/duckdb-browser-eh.worker.js",
    );
    expect(runtime.extensionRepository).toBe(
      "https://stories.example/story/local/extensions",
    );
  });

  it("rejects offline runtime locators that leave the publication", () => {
    const names = [
      "duckdb-browser-mvp.worker.js",
      "duckdb-mvp.wasm",
      "duckdb-browser-eh.worker.js",
      "duckdb-eh.wasm",
      "parquet-mvp",
      "spatial-mvp",
      "parquet-eh",
      "spatial-eh",
    ];
    const runtimeAssets = names.map((name) => ({
      id: `runtime:duckdb:${name}`,
      href:
        name === "duckdb-mvp.wasm"
          ? "https://cdn.example/duckdb-mvp.wasm"
          : `runtime/duckdb/${name}`,
      sha256: "a".repeat(64),
    }));

    expect(() =>
      publicationDuckDbRuntime(
        new URL("https://stories.example/story/index.html"),
        runtimeAssets,
        true,
      ),
    ).toThrow(/outside the publication/i);
  });
});
