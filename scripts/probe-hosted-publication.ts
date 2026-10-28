import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export interface HostedPublicationEvidence {
  version: 1;
  publicationUrl: string;
  checkedAt: string;
  checks: Array<{ id: string; status: "passed" | "failed" }>;
  failures: string[];
}

function publicationBase(value: string) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function needsRange(url: URL) {
  return /\.(?:pmtiles|parquet|tiff?|cog)(?:$)/iu.test(url.pathname);
}

export async function probeHostedPublication(options: {
  publicationUrl: string;
  fetch?: typeof globalThis.fetch;
  checkedAt?: string;
}): Promise<HostedPublicationEvidence> {
  const base = publicationBase(options.publicationUrl);
  const fetcher = options.fetch ?? globalThis.fetch;
  const checks: HostedPublicationEvidence["checks"] = [];
  const failures: string[] = [];
  const record = (id: string, failure?: string) => {
    checks.push({ id, status: failure ? "failed" : "passed" });
    if (failure) failures.push(`${id}: ${failure}`);
  };

  const manifestResponse = await fetcher(new URL("publication.json", base));
  if (!manifestResponse.ok) {
    record("manifest", `expected HTTP 200, received ${manifestResponse.status}`);
    return {
      version: 1,
      publicationUrl: base.href,
      checkedAt: options.checkedAt ?? new Date().toISOString(),
      checks,
      failures,
    };
  }
  const manifest = (await manifestResponse.json()) as {
    build?: { id?: string };
    continuations?: Array<{ kind?: string; projectHref?: string }>;
  };
  record("manifest");
  const continuation = manifest.continuations?.find(
    ({ kind }) => kind === "geolibre",
  );
  if (!continuation?.projectHref) {
    record("companion", "manifest has no GeoLibre continuation");
    return {
      version: 1,
      publicationUrl: base.href,
      checkedAt: options.checkedAt ?? new Date().toISOString(),
      checks,
      failures,
    };
  }
  const companionResponse = await fetcher(
    new URL(continuation.projectHref, base),
  );
  if (!companionResponse.ok) {
    record(
      "companion",
      `expected HTTP 200, received ${companionResponse.status}`,
    );
    return {
      version: 1,
      publicationUrl: base.href,
      checkedAt: options.checkedAt ?? new Date().toISOString(),
      checks,
      failures,
    };
  }
  const companion = (await companionResponse.json()) as {
    metadata?: { earthStories?: { buildId?: string } };
    layers?: Array<{ id?: string; source?: { url?: string } }>;
  };
  record(
    "companion",
    companion.metadata?.earthStories?.buildId === manifest.build?.id
      ? undefined
      : "build ID does not match publication",
  );

  for (const layer of companion.layers ?? []) {
    if (!layer.id || !layer.source?.url) continue;
    const assetUrl = new URL(layer.source.url);
    const assetResponse = await fetcher(assetUrl, {
      headers: { Origin: "https://web.geolibre.app" },
    });
    const cors = assetResponse.headers.get("access-control-allow-origin");
    record(
      `cors:${layer.id}`,
      cors === "*" || cors === "https://web.geolibre.app"
        ? undefined
        : "missing Access-Control-Allow-Origin",
    );
    if (needsRange(assetUrl)) {
      const rangeResponse = await fetcher(assetUrl, {
        headers: { Range: "bytes=0-31" },
      });
      record(
        `range:${layer.id}`,
        rangeResponse.status === 206 &&
          Boolean(rangeResponse.headers.get("content-range"))
          ? undefined
          : "expected HTTP 206 with Content-Range",
      );
    }
  }

  return {
    version: 1,
    publicationUrl: base.href,
    checkedAt: options.checkedAt ?? new Date().toISOString(),
    checks,
    failures,
  };
}

async function main() {
  const values = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2)
    values.set(process.argv[index]!, process.argv[index + 1]!);
  const publicationUrl = values.get("--publication-url");
  if (!publicationUrl)
    throw new Error("--publication-url is required");
  const evidence = await probeHostedPublication({ publicationUrl });
  const output = values.get("--output");
  if (output) await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (evidence.failures.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
