import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function verifyGeoLibreLaunch(options: {
  publicationUrl: string;
  href: string;
}):
  | { status: "passed"; companionUrl: string }
  | { status: "failed"; failure: string } {
  const base = new URL(options.publicationUrl);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const expected = new URL("explore/story.geolibre.json", base).href;
  try {
    const launch = new URL(options.href);
    if (launch.protocol !== "https:" || launch.hostname !== "web.geolibre.app")
      return { status: "failed", failure: "GeoLibre launch host is invalid" };
    if (launch.searchParams.get("url") !== expected)
      return {
        status: "failed",
        failure:
          "GeoLibre launch does not reference this publication companion",
      };
    return { status: "passed", companionUrl: expected };
  } catch {
    return { status: "failed", failure: "GeoLibre launch URL is invalid" };
  }
}

async function main() {
  const values = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2)
    values.set(process.argv[index]!, process.argv[index + 1]!);
  const publicationUrl = values.get("--publication-url");
  if (!publicationUrl) throw new Error("--publication-url is required");
  const base = new URL(publicationUrl);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const response = await fetch(new URL("publication.json", base));
  if (!response.ok)
    throw new Error(`publication manifest returned HTTP ${response.status}`);
  const manifest = (await response.json()) as {
    continuations?: Array<{ kind?: string; href?: string }>;
  };
  const href = manifest.continuations?.find(
    ({ kind }) => kind === "geolibre",
  )?.href;
  const result = href
    ? verifyGeoLibreLaunch({ publicationUrl: base.href, href })
    : ({ status: "failed", failure: "No GeoLibre continuation" } as const);
  const output = values.get("--output");
  if (output) await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
