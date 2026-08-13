import type { DuckDBBundles } from "@duckdb/duckdb-wasm";

export interface PublicationDuckDbRuntime {
  bundles: DuckDBBundles;
  extensionRepository: string;
}

export function publicationDuckDbRuntime(
  publicationUrl: URL,
): PublicationDuckDbRuntime {
  const base = new URL("./runtime/duckdb/", publicationUrl);
  return {
    bundles: {
      mvp: {
        mainModule: new URL("duckdb-mvp.wasm", base).href,
        mainWorker: new URL("duckdb-browser-mvp.worker.js", base).href,
      },
      eh: {
        mainModule: new URL("duckdb-eh.wasm", base).href,
        mainWorker: new URL("duckdb-browser-eh.worker.js", base).href,
      },
    },
    extensionRepository: new URL("extensions", base).href,
  };
}

export function duckDbSpatialSetupSql(extensionRepository: string): string {
  const escaped = extensionRepository.replaceAll("'", "''");
  return `SET custom_extension_repository = '${escaped}'; INSTALL spatial; LOAD spatial;`;
}
