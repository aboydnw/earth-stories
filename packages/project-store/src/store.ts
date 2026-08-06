import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import {
  parseStoryProject,
  storyProjectSchema,
  type StoryProject,
} from "@earth-stories/story-schema";

const STORY_FILENAME = "story.json";
const DEFAULT_BASEMAP = {
  id: "carto-positron",
  label: "CARTO Positron",
  styleUrl: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  attribution: "© OpenStreetMap contributors © CARTO",
} as const;

export interface ProjectSummary {
  id: string;
  title: string;
  description: string;
  updated: string;
  chapterCount: number;
  isExample: boolean;
  invalidReason?: string;
}

const STALE_LOCK_MS = 2 * 60 * 1000;
const MAX_BACKUPS = 20;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

async function retryFileOperation(operation: () => Promise<void>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await operation();
      return;
    } catch (cause) {
      const retryable =
        cause instanceof Error &&
        "code" in cause &&
        ["EACCES", "EBUSY", "EPERM"].includes(String(cause.code));
      if (!retryable || attempt >= 4) throw cause;
      await wait(50 * 2 ** attempt);
    }
  }
}

export interface CreateProjectInput {
  title: string;
  description?: string;
  author?: string | null;
}

export interface ImportedAsset {
  path: string;
  filename: string;
  sizeBytes: number;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return WINDOWS_RESERVED_NAME.test(slug) ? `${slug}-story` : slug;
}

function assertSafeId(id: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
    throw new Error("Invalid project ID");
  }
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

export class ProjectStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  private directory(id: string): string {
    assertSafeId(id);
    return join(this.root, id);
  }

  async list(): Promise<ProjectSummary[]> {
    await this.initialize();
    const entries = await readdir(this.root, { withFileTypes: true });
    const projects: ProjectSummary[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isDirectory()) return;
        try {
          const project = await this.read(entry.name);
          projects.push({
            id: project.id,
            title: project.metadata.title,
            description: project.metadata.description,
            updated: project.metadata.updated,
            chapterCount: project.chapters.length,
            isExample: project.id.startsWith("example-"),
          });
        } catch (cause) {
          const storyPath = join(this.root, entry.name, STORY_FILENAME);
          try {
            const info = await stat(storyPath);
            projects.push({
              id: entry.name,
              title: entry.name,
              description: "This project could not be opened.",
              updated: info.mtime.toISOString(),
              chapterCount: 0,
              isExample: entry.name.startsWith("example-"),
              invalidReason:
                cause instanceof Error
                  ? cause.message
                  : "The project file is invalid.",
            });
          } catch {
            // Directories without story.json are not Earth Stories projects.
          }
        }
      }),
    );

    return projects.sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async create(input: CreateProjectInput): Promise<StoryProject> {
    const title = input.title.trim();
    if (!title) throw new Error("Project title is required");
    await this.initialize();

    const candidate = slugify(title) || "untitled-story";
    const base = candidate.startsWith("example-")
      ? `story-${candidate}`
      : candidate;
    let id = base;
    let suffix = 2;
    while (await this.exists(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }

    const now = new Date().toISOString();
    const project = storyProjectSchema.parse({
      schema: "earth-stories/project/v1",
      id,
      metadata: {
        title,
        description: input.description?.trim() ?? "",
        author: input.author ?? null,
        created: now,
        updated: now,
      },
      basemap: DEFAULT_BASEMAP,
      sources: [],
      dataAssets: [],
      chapters: [
        {
          id: randomUUID(),
          type: "prose",
          title: "Opening",
          narrative: "",
        },
      ],
    });

    await mkdir(this.directory(id), { recursive: false });
    await this.writeAtomic(id, project, false);
    return project;
  }

  async createFromTemplate(template: StoryProject): Promise<StoryProject> {
    const validated = storyProjectSchema.parse(template);
    await this.initialize();
    const id = validated.id;
    assertSafeId(id);
    if (!id.startsWith("example-"))
      throw new Error('Example template IDs must start with "example-"');
    if (await this.exists(id)) return this.read(id);
    const now = new Date().toISOString();
    const project = storyProjectSchema.parse({
      ...structuredClone(validated),
      id,
      metadata: { ...validated.metadata, created: now, updated: now },
    });
    await mkdir(this.directory(id), { recursive: false });
    await this.writeAtomic(id, project, false);
    return project;
  }

  async read(id: string): Promise<StoryProject> {
    const contents = await readFile(
      join(this.directory(id), STORY_FILENAME),
      "utf8",
    );
    return parseStoryProject(JSON.parse(contents) as unknown);
  }

  async save(id: string, value: unknown): Promise<StoryProject> {
    const project = storyProjectSchema.parse(value);
    if (project.id !== id) throw new Error("Project ID cannot be changed");
    const current = await this.read(id);
    if (project.metadata.updated !== current.metadata.updated) {
      throw new Error(
        "This story changed on disk after you opened it. Reopen the story before saving so those changes are not overwritten.",
      );
    }
    const updated = storyProjectSchema.parse({
      ...project,
      metadata: {
        ...project.metadata,
        created: current.metadata.created,
        updated: new Date().toISOString(),
      },
    });
    await this.writeAtomic(id, updated, true);
    return updated;
  }

  async archive(id: string): Promise<void> {
    await this.read(id);
    const trash = join(this.root, ".trash");
    await mkdir(trash, { recursive: true });
    const archivedAt = new Date().toISOString().replace(/[:.]/g, "-");
    await retryFileOperation(() =>
      rename(this.directory(id), join(trash, `${id}-${archivedAt}`)),
    );
  }

  assetPath(id: string, requestedPath: string): string {
    const projectDirectory = this.directory(id);
    const candidate = resolve(projectDirectory, requestedPath);
    if (
      !isInside(projectDirectory, candidate) ||
      candidate === projectDirectory
    ) {
      throw new Error("Asset path escapes the project directory");
    }
    return candidate;
  }

  projectPath(id: string): string {
    return this.directory(id);
  }

  async importAsset(
    id: string,
    filename: string,
    contents: Uint8Array,
  ): Promise<ImportedAsset> {
    await this.read(id);
    const { assetsDirectory, candidate } = await this.allocateAssetPath(
      id,
      filename,
    );
    await writeFile(join(assetsDirectory, candidate), contents, { flag: "wx" });
    return {
      path: `assets/${candidate}`,
      filename: candidate,
      sizeBytes: contents.byteLength,
    };
  }

  async importAssetStream(
    id: string,
    filename: string,
    chunks: AsyncIterable<Uint8Array>,
    maxBytes: number,
  ): Promise<ImportedAsset> {
    await this.read(id);
    const { assetsDirectory, candidate } = await this.allocateAssetPath(
      id,
      filename,
    );
    const destination = join(assetsDirectory, candidate);
    const handle = await open(destination, "wx", 0o600);
    let sizeBytes = 0;
    try {
      for await (const chunk of chunks) {
        sizeBytes += chunk.byteLength;
        if (sizeBytes > maxBytes)
          throw new Error(
            `Asset exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB local import limit`,
          );
        await handle.write(chunk);
      }
      await handle.sync();
    } catch (cause) {
      await handle.close();
      await unlink(destination).catch(() => undefined);
      throw cause;
    }
    await handle.close();
    return {
      path: `assets/${candidate}`,
      filename: candidate,
      sizeBytes,
    };
  }

  private async allocateAssetPath(
    id: string,
    filename: string,
  ): Promise<{ assetsDirectory: string; candidate: string }> {
    let safeName = filename
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+/, "")
      .replace(/[. ]+$/, "");
    if (!safeName || safeName === "." || safeName === "..")
      throw new Error("Asset filename is invalid");
    const safeDot = safeName.lastIndexOf(".");
    const safeStem = safeDot > 0 ? safeName.slice(0, safeDot) : safeName;
    if (WINDOWS_RESERVED_NAME.test(safeStem)) {
      safeName =
        safeDot > 0
          ? `${safeStem}-file${safeName.slice(safeDot)}`
          : `${safeStem}-file`;
    }
    const assetsDirectory = join(this.directory(id), "assets");
    await mkdir(assetsDirectory, { recursive: true });
    let candidate = safeName;
    let suffix = 2;
    const dot = safeName.lastIndexOf(".");
    const stem = dot > 0 ? safeName.slice(0, dot) : safeName;
    const extension = dot > 0 ? safeName.slice(dot) : "";
    while (await this.existsAsset(join(assetsDirectory, candidate))) {
      candidate = `${stem}-${suffix}${extension}`;
      suffix += 1;
    }
    return { assetsDirectory, candidate };
  }

  private async existsAsset(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return false;
      throw error;
    }
  }

  private async exists(id: string): Promise<boolean> {
    try {
      await stat(this.directory(id));
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return false;
      }
      throw error;
    }
  }

  private async writeAtomic(
    id: string,
    project: StoryProject,
    createBackup: boolean,
  ): Promise<void> {
    const projectDirectory = this.directory(id);
    const storyPath = join(projectDirectory, STORY_FILENAME);
    const lockPath = join(projectDirectory, ".earth-stories-write.lock");
    const temporaryPath = join(
      projectDirectory,
      `${STORY_FILENAME}.${randomUUID()}.tmp`,
    );
    const lock = await this.acquireWriteLock(lockPath);

    try {
      if (createBackup) {
        const backupDirectory = join(
          projectDirectory,
          ".earth-stories",
          "backups",
        );
        await mkdir(backupDirectory, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        await copyFile(storyPath, join(backupDirectory, `${stamp}.json`));
        const backups = (await readdir(backupDirectory))
          .filter((name) => name.endsWith(".json"))
          .sort()
          .reverse();
        await Promise.all(
          backups
            .slice(MAX_BACKUPS)
            .map((name) =>
              unlink(join(backupDirectory, name)).catch(() => undefined),
            ),
        );
      }

      const file = await open(temporaryPath, "wx");
      try {
        await file.writeFile(`${JSON.stringify(project, null, 2)}\n`, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      await retryFileOperation(() => rename(temporaryPath, storyPath));
    } finally {
      await lock.close();
      await unlink(lockPath).catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  private async acquireWriteLock(lockPath: string) {
    try {
      const lock = await open(lockPath, "wx");
      await lock.writeFile(
        `${JSON.stringify({ pid: process.pid, created: new Date().toISOString() })}\n`,
        "utf8",
      );
      await lock.sync();
      return lock;
    } catch (cause) {
      if (!(
        cause instanceof Error &&
        "code" in cause &&
        cause.code === "EEXIST"
      ))
        throw cause;
      const info = await stat(lockPath).catch(() => null);
      if (!info || Date.now() - info.mtimeMs <= STALE_LOCK_MS) {
        throw new Error(
          "This story is already being saved. Wait a moment and try again.",
        );
      }
      await unlink(lockPath);
      const lock = await open(lockPath, "wx");
      await lock.writeFile(
        `${JSON.stringify({ pid: process.pid, created: new Date().toISOString(), recovered: true })}\n`,
        "utf8",
      );
      await lock.sync();
      return lock;
    }
  }
}
