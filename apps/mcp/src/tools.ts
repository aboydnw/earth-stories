import { z } from "zod";
import {
  createDefaultSourceProvenance,
  parseStoryProject,
  projectChapterSchema,
  projectSourceSchema,
} from "@earth-stories/story-schema";
import type { ServiceClient } from "./client.js";

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  run(args: Record<string, unknown>): Promise<string>;
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

interface ExampleConnection {
  id: string;
  title: string;
  description: string;
  kind: string;
  locator: string;
  attribution: string;
  tileType?: string;
  config?: Record<string, unknown>;
}

/**
 * Tools an agent can call against a local Earth Stories workspace.
 *
 * Writes are deliberately whole-project: the service validates and saves
 * `story.json` atomically, so the agent never sees a half-written project and
 * an invalid edit is refused before anything is written.
 */
export function buildTools(client: ServiceClient): Tool[] {
  return [
    {
      name: "list_projects",
      description:
        "List the local Earth Stories projects with id, title, and chapter count.",
      inputSchema: {},
      run: async () => pretty(await client.listProjects()),
    },
    {
      name: "read_project",
      description:
        "Read one project as validated story.json (schema earth-stories/project/v2).",
      inputSchema: { projectId: z.string().min(1) },
      run: async (args) =>
        pretty(await client.readProject(String(args.projectId))),
    },
    {
      name: "create_project",
      description: "Create an empty project with a title and return it.",
      inputSchema: { title: z.string().min(1) },
      run: async (args) =>
        pretty(await client.createProject(String(args.title))),
    },
    {
      name: "update_project",
      description:
        "Replace a project with a full, schema-valid story.json object. Invalid input is refused before anything is written.",
      inputSchema: { project: z.record(z.string(), z.unknown()) },
      run: async (args) =>
        pretty(await client.saveProject(parseStoryProject(args.project))),
    },
    {
      name: "add_chapter",
      description:
        "Append one chapter to a project. Chapter types: prose, map, scrolly, image, chart, video, flyover.",
      inputSchema: {
        projectId: z.string().min(1),
        chapter: z.record(z.string(), z.unknown()),
      },
      run: async (args) => {
        const chapter = projectChapterSchema.parse(args.chapter);
        const project = await client.readProject(String(args.projectId));
        const saved = await client.saveProject({
          ...project,
          chapters: [...project.chapters, chapter],
        });
        return `Added chapter "${chapter.title}" (${chapter.type}). ${saved.metadata.title} now has ${saved.chapters.length} chapters.`;
      },
    },
    {
      name: "list_examples",
      description:
        "List the curated example stories and the public example connections (COG, PMTiles, Zarr, COPC).",
      inputSchema: {},
      run: async () => pretty(await client.listExamples()),
    },
    {
      name: "create_example_story",
      description:
        "Materialize a curated example story as a new, independent local project.",
      inputSchema: { exampleId: z.string().min(1) },
      run: async (args) =>
        pretty(await client.createExampleStory(String(args.exampleId))),
    },
    {
      name: "add_example_connection",
      description:
        "Add one curated example connection to a project as a connected source.",
      inputSchema: {
        projectId: z.string().min(1),
        connectionId: z.string().min(1),
      },
      run: async (args) => {
        const catalog = (await client.listExamples()) as {
          connections?: ExampleConnection[];
        };
        const connection = (catalog.connections ?? []).find(
          (item) => item.id === args.connectionId,
        );
        if (!connection)
          throw new Error(
            `No example connection named ${String(args.connectionId)}`,
          );
        const source = projectSourceSchema.parse({
          id: `example-${connection.id}`,
          label: connection.title,
          kind: connection.kind,
          locator: connection.locator,
          attribution: connection.attribution,
          sizeBytes: null,
          delivery: "connected",
          provenance: createDefaultSourceProvenance(),
          ...(connection.tileType ? { tileType: connection.tileType } : {}),
          ...(connection.config ?? {}),
        });
        const project = await client.readProject(String(args.projectId));
        const saved = await client.saveProject({
          ...project,
          sources: [...project.sources, source],
        });
        return `Added source ${source.id} to ${saved.metadata.title}. Reference it from a chapter's sourceId.`;
      },
    },
    {
      name: "discover_source",
      description:
        "Inspect a public data URL: format, size, CORS and byte-range support, PMTiles layers, Zarr variables.",
      inputSchema: { url: z.string().url() },
      run: async (args) => pretty(await client.discover(String(args.url))),
    },
    {
      name: "prepare_data",
      description:
        "Prepare an imported raw file (a path from the project's dataAssets) into a story-ready source. Returns a job to poll with get_job.",
      inputSchema: {
        projectId: z.string().min(1),
        assetPath: z.string().min(1),
        capability: z.enum(["raster", "vector", "multidim", "pointcloud"]),
        options: z.record(z.string(), z.unknown()).optional(),
      },
      run: async (args) =>
        pretty(
          await client.startConversion(String(args.projectId), {
            operation: "prepare",
            capability: args.capability,
            assetPath: args.assetPath,
            options: args.options,
          }),
        ),
    },
    {
      name: "get_job",
      description: "Read a conversion job's status and progress events.",
      inputSchema: { jobId: z.string().min(1) },
      run: async (args) =>
        pretty(await client.getConversionJob(String(args.jobId))),
    },
    {
      name: "preflight",
      description:
        "Run publication preflight: blocking errors, portability warnings, and size estimates.",
      inputSchema: { projectId: z.string().min(1) },
      run: async (args) =>
        pretty(await client.preflight(String(args.projectId))),
    },
    {
      name: "build_publication",
      description:
        "Build the latest publication folder for a project. Runs preflight first and fails on blocking errors.",
      inputSchema: { projectId: z.string().min(1) },
      run: async (args) =>
        pretty(await client.exportProject(String(args.projectId), "folder")),
    },
  ];
}
