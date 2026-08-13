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
});
