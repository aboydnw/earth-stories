import type { DuckDBBundles } from "@duckdb/duckdb-wasm";
import type { PublicationManifest } from "@earth-stories/story-schema";

export interface PublicationDuckDbRuntime {
  bundles: DuckDBBundles & {
    mvp: NonNullable<DuckDBBundles["mvp"]>;
    eh: NonNullable<DuckDBBundles["eh"]>;
  };
  extensionRepository: string;
}

export function publicationDuckDbRuntime(
  publicationUrl: URL,
  runtimeAssets: PublicationManifest["runtimeAssets"] = [],
  offline = false,
): PublicationDuckDbRuntime {
  if (offline) {
    const required = [
      "duckdb-browser-mvp.worker.js",
      "duckdb-mvp.wasm",
      "duckdb-browser-eh.worker.js",
      "duckdb-eh.wasm",
      "parquet-mvp",
      "spatial-mvp",
      "parquet-eh",
      "spatial-eh",
    ];
    const assets = new Map(
      runtimeAssets.map((asset) => [
        asset.id.replace("runtime:duckdb:", ""),
        asset,
      ]),
    );
    const missing = required.filter((name) => !assets.has(name));
    if (missing.length)
      throw new Error(
        `Offline GeoParquet runtime is incomplete; missing ${missing.join(", ")}.`,
      );
    const publicationRoot = new URL("./", publicationUrl);
    const resolveHref = (name: string) => {
      const resolved = new URL(assets.get(name)!.href, publicationUrl);
      if (
        resolved.origin !== publicationRoot.origin ||
        !resolved.pathname.startsWith(publicationRoot.pathname)
      )
        throw new Error(
          `Offline GeoParquet runtime asset ${name} resolves outside the publication.`,
        );
      return resolved.href;
    };
    const resolvedAssets = new Map(
      required.map((name) => [name, resolveHref(name)]),
    );
    const href = (name: string) => resolvedAssets.get(name)!;
    const extensionUrls = required
      .filter(
        (name) => name.startsWith("parquet-") || name.startsWith("spatial-"),
      )
      .map(href);
    const repositories = new Set(
      extensionUrls.map((url) => url.replace(/\/v[^/]+\/.*$/, "")),
    );
    if (repositories.size !== 1)
      throw new Error(
        "Offline GeoParquet runtime is incomplete; extension assets do not share a repository.",
      );
    return {
      bundles: {
        mvp: {
          mainModule: href("duckdb-mvp.wasm"),
          mainWorker: href("duckdb-browser-mvp.worker.js"),
        },
        eh: {
          mainModule: href("duckdb-eh.wasm"),
          mainWorker: href("duckdb-browser-eh.worker.js"),
        },
      },
      extensionRepository: [...repositories][0]!,
    };
  }
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
