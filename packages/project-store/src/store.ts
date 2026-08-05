import { randomUUID } from "node:crypto";
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
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
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
          });
        } catch {
          // A directory is not a project unless its story file validates.
        }
      }),
    );

    return projects.sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async create(input: CreateProjectInput): Promise<StoryProject> {
    const title = input.title.trim();
    if (!title) throw new Error("Project title is required");
    await this.initialize();

    const base = slugify(title) || "untitled-story";
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
    const base = slugify(validated.metadata.title) || "example-story";
    let id = base;
    let suffix = 2;
    while (await this.exists(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
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
    return storyProjectSchema.parse(JSON.parse(contents) as unknown);
  }

  async save(id: string, value: unknown): Promise<StoryProject> {
    const project = storyProjectSchema.parse(value);
    if (project.id !== id) throw new Error("Project ID cannot be changed");
    const current = await this.read(id);
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
    const safeName = filename
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+/, "");
    if (!safeName || safeName === "." || safeName === "..")
      throw new Error("Asset filename is invalid");
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
    await writeFile(join(assetsDirectory, candidate), contents, { flag: "wx" });
    return {
      path: `assets/${candidate}`,
      filename: candidate,
      sizeBytes: contents.byteLength,
    };
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
    const lock = await open(lockPath, "wx");

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
      }

      const file = await open(temporaryPath, "wx");
      try {
        await file.writeFile(`${JSON.stringify(project, null, 2)}\n`, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporaryPath, storyPath);
    } finally {
      await lock.close();
      await unlink(lockPath).catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
}
