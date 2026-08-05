import { access, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import {
  publicationManifestSchema,
  type PublicationManifest,
} from "@earth-stories/story-schema";

export interface PublicationVerification {
  verifiedAt: string;
  buildId: string;
  checkedFiles: number;
  includedAssets: number;
  status: "passed";
}

export async function verifyPublication(
  directory: string,
  expected: PublicationManifest,
  options: { requireEmbed?: boolean } = {},
): Promise<PublicationVerification> {
  const required = [
    "index.html",
    "publication.json",
    "archival.html",
    "publication-report.html",
    "README.txt",
    ...(options.requireEmbed ? ["embed.html", "EMBED.txt"] : []),
  ];
  const failures: string[] = [];
  for (const filename of required) {
    try {
      const info = await stat(join(directory, filename));
      if (!info.isFile() || info.size === 0)
        failures.push(`${filename} is empty`);
    } catch {
      failures.push(`${filename} is missing`);
    }
  }

  try {
    const manifest = publicationManifestSchema.parse(
      JSON.parse(await readFile(join(directory, "publication.json"), "utf8")),
    );
    if (manifest.build.id !== expected.build.id)
      failures.push("publication.json does not match the current build");
  } catch {
    failures.push("publication.json is not a valid publication manifest");
  }

  const included = expected.assets.filter(
    (asset) => asset.delivery === "included",
  );
  for (const asset of included) {
    const path = resolve(directory, asset.href);
    const fromRoot = relative(resolve(directory), path);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
      failures.push(
        `included asset “${asset.label}” escapes the release folder`,
      );
      continue;
    }
    try {
      await access(path);
      if (!(await stat(path)).isFile())
        failures.push(`included asset “${asset.label}” is not a file`);
    } catch {
      failures.push(`included asset “${asset.label}” is missing`);
    }
  }

  if (failures.length)
    throw new Error(`Publication verification failed: ${failures.join("; ")}`);

  return {
    verifiedAt: new Date().toISOString(),
    buildId: expected.build.id,
    checkedFiles: required.length + 1 + included.length,
    includedAssets: included.length,
    status: "passed",
  };
}
