import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  extname,
} from "node:path";
import {
  createDefaultSourceProvenance,
  projectSourceSchema,
  type ProjectSource,
} from "@earth-stories/story-schema";

const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function inside(root: string, target: string) {
  const path = relative(root, target);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
export function workspaceDataLocator(source: ProjectSource): string {
  return "path" in source ? source.path : source.locator;
}
/** Resolve only local project files or the explicit managed library namespace. */
export async function resolveProjectAsset(
  projectDirectory: string,
  locator: string,
  message = "Asset points outside the project workspace",
): Promise<string> {
  let root = resolve(projectDirectory);
  let path = locator;
  if (locator.startsWith("workspace-data/")) {
    const parts = locator.split("/");
    if (
      parts.length !== 3 ||
      !ID.test(parts[1]) ||
      !/^data\.(geojson|json|tif|tiff|pmtiles|parquet)$/.test(parts[2])
    )
      throw new Error("Invalid workspace data reference");
    const workspace = await realpath(dirname(root));
    root = await realpath(join(workspace, ".data-library"));
    if (!inside(workspace, root)) throw new Error(message);
    path = `${parts[1]}/${parts[2]}`;
  }
  const candidate = resolve(root, path);
  if (!inside(root, candidate) || candidate === root) throw new Error(message);
  const [canonicalRoot, canonicalFile] = await Promise.all([
    realpath(root),
    realpath(candidate),
  ]);
  if (!inside(canonicalRoot, canonicalFile)) throw new Error(message);
  return canonicalFile;
}

/** Immutable entries: upload to a private staging directory, then atomically expose. */
export class WorkspaceDataStore {
  readonly root: string;
  constructor(workspace: string) {
    this.root = resolve(workspace);
  }
  private async directory() {
    await mkdir(this.root, { recursive: true });
    const root = await realpath(this.root);
    const library = join(root, ".data-library");
    await mkdir(library, { recursive: true });
    if (!inside(root, await realpath(library)))
      throw new Error("Data library points outside the workspace");
    return library;
  }
  async list(): Promise<ProjectSource[]> {
    const directory = await this.directory();
    const entries = await readdir(directory, { withFileTypes: true });
    return Promise.all(
      entries
        .filter((e) => e.isDirectory() && ID.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => this.read(e.name)),
    );
  }
  async read(id: string): Promise<ProjectSource> {
    if (!ID.test(id)) throw new Error("Invalid dataset ID");
    const directory = await this.directory();
    const file = await realpath(join(directory, id, "source.json"));
    if (!inside(directory, file))
      throw new Error("Dataset points outside the library");
    const source = projectSourceSchema.parse(
      JSON.parse(await readFile(file, "utf8")),
    );
    if (source.id !== id) throw new Error("Dataset ID mismatch");
    return source;
  }
  async importFile(
    filename: string,
    chunks: AsyncIterable<Uint8Array>,
    maxBytes: number,
  ): Promise<ProjectSource> {
    const extension = extname(filename).toLowerCase();
    if (
      ![".geojson", ".json", ".tif", ".tiff", ".pmtiles", ".parquet"].includes(
        extension,
      )
    )
      throw new Error("Choose GeoJSON, GeoTIFF, PMTiles, or GeoParquet data.");
    const id = randomUUID();
    const directory = await this.directory();
    const staging = join(directory, `.pending-${id}`);
    await mkdir(staging);
    try {
      const handle = await open(join(staging, `data${extension}`), "wx", 0o600);
      let sizeBytes = 0;
      try {
        for await (const chunk of chunks) {
          sizeBytes += chunk.byteLength;
          if (sizeBytes > maxBytes)
            throw new Error("Dataset exceeds the local import limit");
          await handle.writeFile(chunk);
        }
        await handle.sync();
      } finally {
        await handle.close();
      }
      const common = {
        id,
        label: filename,
        attribution: null,
        sizeBytes,
        delivery: "included",
        provenance: createDefaultSourceProvenance(),
      };
      const locator = `workspace-data/${id}/data${extension}`;
      const source = projectSourceSchema.parse(
        extension === ".geojson" || extension === ".json"
          ? { ...common, kind: "local-geojson", path: locator }
          : extension === ".pmtiles"
            ? { ...common, kind: "pmtiles", locator, tileType: "vector" }
            : {
                ...common,
                kind: extension === ".parquet" ? "geoparquet" : "cog",
                locator,
              },
      );
      await this.writeRecord(staging, source);
      await rename(staging, join(directory, id));
      return source;
    } catch (cause) {
      await rm(staging, { recursive: true, force: true });
      throw cause;
    }
  }
  async connect(value: unknown): Promise<ProjectSource> {
    const source = projectSourceSchema.parse(value);
    const locator = workspaceDataLocator(source);
    const url = new URL(locator);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      source.delivery !== "connected" ||
      "path" in source
    )
      throw new Error("Use a public HTTP(S) connection without credentials.");
    const next = { ...source, id: randomUUID() };
    const directory = await this.directory();
    const staging = join(directory, `.pending-${next.id}`);
    await mkdir(staging);
    try {
      await this.writeRecord(staging, next);
      await rename(staging, join(directory, next.id));
      return next;
    } catch (cause) {
      await rm(staging, { recursive: true, force: true });
      throw cause;
    }
  }
  private async writeRecord(directory: string, source: ProjectSource) {
    const handle = await open(join(directory, "source.json"), "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(source, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
