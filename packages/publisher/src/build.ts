import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type {
  PublicationManifest,
  StoryProject,
} from "@earth-stories/story-schema";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { compileProject } from "./compile.js";

export interface BuildPublicationOptions {
  projectDirectory: string;
  outputDirectory: string;
  viewerDirectory?: string;
}

async function copyIncludedAssets(
  project: StoryProject,
  projectDirectory: string,
  outputDirectory: string,
): Promise<void> {
  const assetsDirectory = join(outputDirectory, "assets");
  await mkdir(assetsDirectory, { recursive: true });

  const manifest = compileProject(project);
  for (const source of project.sources) {
    const asset = manifest.assets.find(
      (candidate) => candidate.id === source.id,
    );
    if (!asset || asset.delivery !== "included") continue;
    const sourceLocator =
      source.kind === "local-geojson" ||
      source.kind === "image" ||
      source.kind === "csv"
        ? source.path
        : source.kind === "pmtiles" || source.kind === "geoparquet"
          ? source.locator
          : null;
    if (!sourceLocator) continue;
    const sourcePath = resolve(projectDirectory, sourceLocator);
    const relation = relative(resolve(projectDirectory), sourcePath);
    if (relation === ".." || relation.startsWith(`..${sep}`))
      throw new Error(`Asset ${source.id} escapes the project directory`);
    const destinationPath = join(outputDirectory, asset.href);
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath);
  }
}

function reportHtml(manifest: PublicationManifest): string {
  const included = manifest.assets.filter(
    (asset) => asset.delivery === "included",
  );
  const connected = manifest.assets.filter(
    (asset) => asset.delivery === "connected",
  );
  const list = (items: typeof manifest.assets) =>
    items.length === 0
      ? "<p>None.</p>"
      : `<ul>${items
          .map(
            (asset) =>
              `<li><strong>${asset.label}</strong> — ${asset.href}</li>`,
          )
          .join("")}</ul>`;
  const dependencies = manifest.externalDependencies
    .map(
      (dependency) =>
        `<li><code>${dependency.resourceId}</code> — ${dependency.href}<br><small>${dependency.requirements.join(", ")}</small></li>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Publication report</title><style>body{max-width:760px;margin:48px auto;padding:0 24px;font:16px/1.55 system-ui;color:#332b27}h1,h2{font-family:Georgia,serif}code{background:#f2ede7;padding:2px 5px}</style><body><h1>Publication report</h1><p><strong>${manifest.metadata.title}</strong></p><p>Build <code>${manifest.build.id}</code> · Runtime ${manifest.build.runtimeVersion}</p><h2>Included assets</h2>${list(included)}<h2>Connected data assets</h2>${list(connected)}<h2>All external dependencies</h2><ul>${dependencies}</ul><p>External dependencies must remain publicly accessible for the story to work.</p></body></html>`;
}

export async function buildPublication({
  projectDirectory,
  outputDirectory,
  viewerDirectory,
}: BuildPublicationOptions): Promise<PublicationManifest> {
  const projectPath = join(projectDirectory, "story.json");
  const project = storyProjectSchema.parse(
    JSON.parse(await readFile(projectPath, "utf8")) as unknown,
  );
  const manifest = compileProject(project);

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await copyIncludedAssets(project, projectDirectory, outputDirectory);

  if (viewerDirectory) {
    await cp(viewerDirectory, outputDirectory, { recursive: true });
  } else {
    await writeFile(
      join(outputDirectory, "index.html"),
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>Build the viewer first</title><body><p>The publication manifest is ready. Build the viewer application before release.</p></body></html>',
    );
  }

  await writeFile(
    join(outputDirectory, "publication.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    join(outputDirectory, "publication-report.html"),
    reportHtml(manifest),
  );
  await writeFile(
    join(outputDirectory, "README.txt"),
    `${manifest.metadata.title}\n\nUpload every file in this directory to the same static website directory. Open index.html through a static web server.\n\nBuild: ${manifest.build.id}\nProject: ${basename(projectDirectory)}\nManifest: publication.json\nReport: publication-report.html\n`,
  );
  return manifest;
}
