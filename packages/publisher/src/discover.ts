import { authorizedFetch } from "./remote-fetch.js";
import { validateRemoteUrl } from "./remote-url.js";
import { PMTiles, type Source } from "pmtiles";

export type DiscoveredSourceKind =
  | "cog"
  | "pmtiles"
  | "geoparquet"
  | "xyz"
  | "zarr"
  | "trajectory"
  | "copc"
  | "unknown";

export interface RemoteSourceDiscovery {
  url: string;
  kind: DiscoveredSourceKind;
  contentType: string | null;
  sizeBytes: number | null;
  cors: boolean;
  byteRanges: boolean;
  reachable: boolean;
  issues: string[];
  details: {
    minZoom?: number;
    maxZoom?: number;
    sourceLayers?: string[];
    variables?: Array<{
      name: string;
      dimensions: string[];
      shape: number[];
      dataType?: string;
    }>;
  };
}

type RemoteFetcher = (input: string, init?: RequestInit) => Promise<Response>;

class AuthorizedPmtilesSource implements Source {
  constructor(
    private readonly url: string,
    private readonly fetcher: RemoteFetcher,
  ) {}
  getKey() {
    return this.url;
  }
  async getBytes(offset: number, length: number) {
    const response = await this.fetcher(this.url, {
      headers: { range: `bytes=${offset}-${offset + length - 1}` },
    });
    if (!response.ok)
      throw new Error(`PMTiles range request failed (${response.status}).`);
    return {
      data: await response.arrayBuffer(),
      etag: response.headers.get("etag") ?? undefined,
      expires: response.headers.get("expires") ?? undefined,
      cacheControl: response.headers.get("cache-control") ?? undefined,
    };
  }
}

async function discoverPmtiles(url: string, fetcher: RemoteFetcher) {
  const archive = new PMTiles(new AuthorizedPmtilesSource(url, fetcher));
  const [header, rawMetadata] = await Promise.all([
    archive.getHeader(),
    archive.getMetadata(),
  ]);
  const metadata = rawMetadata as {
    vector_layers?: Array<{ id?: unknown }>;
  };
  return {
    minZoom: header.minZoom,
    maxZoom: header.maxZoom,
    sourceLayers: (metadata.vector_layers ?? []).flatMap((layer) =>
      typeof layer.id === "string" ? [layer.id] : [],
    ),
  };
}

async function discoverZarr(url: URL, fetcher: RemoteFetcher) {
  const base = url.href.endsWith("/") ? url.href : `${url.href}/`;
  const response = await fetcher(new URL(".zmetadata", base).href);
  if (!response.ok) return { variables: [] };
  const consolidated = (await response.json()) as {
    metadata?: Record<string, unknown>;
  };
  const metadata = consolidated.metadata ?? {};
  const variables = Object.entries(metadata).flatMap(([key, value]) => {
    if (!key.endsWith("/.zarray") || !value || typeof value !== "object")
      return [];
    const name = key.slice(0, -"/.zarray".length);
    const array = value as { shape?: unknown; dtype?: unknown };
    const attributes = metadata[`${name}/.zattrs`] as
      { _ARRAY_DIMENSIONS?: unknown } | undefined;
    return [
      {
        name,
        dimensions: Array.isArray(attributes?._ARRAY_DIMENSIONS)
          ? attributes._ARRAY_DIMENSIONS.filter(
              (item): item is string => typeof item === "string",
            )
          : [],
        shape: Array.isArray(array.shape)
          ? array.shape.filter(
              (item): item is number => typeof item === "number",
            )
          : [],
        dataType: typeof array.dtype === "string" ? array.dtype : undefined,
      },
    ];
  });
  return { variables };
}

function detectKind(
  url: URL,
  contentType: string | null,
): DiscoveredSourceKind {
  const value = `${url.pathname}${url.search}`.toLowerCase();
  if (/\{z\}.*\{x\}.*\{y\}|\{z\}.*\{y\}.*\{x\}/.test(value)) return "xyz";
  if (value.includes(".pmtiles")) return "pmtiles";
  if (value.includes(".copc.laz")) return "copc";
  if (value.includes(".parquet") || contentType?.includes("parquet"))
    return "geoparquet";
  if (value.includes(".zarr")) return "zarr";
  if (/\.tiff?(?:$|[?#])/.test(value) || contentType?.includes("tiff"))
    return "cog";
  if (value.includes("trips.json") || value.includes("trajectory"))
    return "trajectory";
  return "unknown";
}

export async function discoverRemoteSource(
  input: string,
  fetcher: RemoteFetcher = authorizedFetch,
): Promise<RemoteSourceDiscovery> {
  const url = validateRemoteUrl(input);
  const kind = detectKind(url, null);
  if (kind === "xyz")
    return {
      url: url.href,
      kind,
      contentType: null,
      sizeBytes: null,
      cors: true,
      byteRanges: false,
      reachable: true,
      issues: [],
      details: {},
    };
  const response = await fetcher(url.href, {
    headers: { range: "bytes=0-16383", origin: "http://127.0.0.1:5173" },
  });
  await response.body?.cancel();
  const contentType = response.headers.get("content-type");
  const detectedKind = detectKind(url, contentType);
  const contentRange = response.headers.get("content-range");
  const rangeSize = contentRange?.match(/\/(\d+)$/)?.[1];
  const contentLength = response.headers.get("content-length");
  const sizeBytes = Number(rangeSize ?? contentLength);
  const corsHeader = response.headers.get("access-control-allow-origin");
  const cors = corsHeader === "*" || corsHeader?.includes("127.0.0.1") === true;
  const byteRanges =
    response.status === 206 ||
    response.headers.get("accept-ranges")?.toLowerCase() === "bytes";
  const issues: string[] = [];
  if (!response.ok) issues.push(`The server returned HTTP ${response.status}.`);
  if (!cors) issues.push("Browser CORS access was not confirmed.");
  if (
    ["cog", "pmtiles", "geoparquet", "copc"].includes(detectedKind) &&
    !byteRanges
  )
    issues.push("Byte-range access was not confirmed.");
  if (detectedKind === "unknown")
    issues.push("Earth Stories could not identify this URL's data format.");
  let details: RemoteSourceDiscovery["details"] = {};
  if (response.ok && byteRanges && detectedKind === "pmtiles") {
    try {
      details = await discoverPmtiles(url.href, fetcher);
    } catch {
      issues.push("PMTiles metadata could not be read.");
    }
  } else if (response.ok && detectedKind === "zarr") {
    try {
      details = await discoverZarr(url, fetcher);
      if (!details.variables?.length)
        issues.push("No consolidated Zarr variables were discovered.");
    } catch {
      issues.push("Zarr metadata could not be read.");
    }
  }
  return {
    url: url.href,
    kind: detectedKind,
    contentType,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
    cors,
    byteRanges,
    reachable: response.ok,
    issues,
    details,
  };
}
