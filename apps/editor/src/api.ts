import {
  storyProjectSchema,
  type StoryProject,
} from "@earth-stories/story-schema";

export interface ProjectSummary {
  id: string;
  title: string;
  description: string;
  updated: string;
  chapterCount: number;
}

export interface ImportedAsset {
  path: string;
  filename: string;
  sizeBytes: number;
}
export interface PreflightIssue {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  resolution?: string;
  resourceId?: string;
}
export interface PublicationPreflight {
  ready: boolean;
  projectId: string;
  buildId: string | null;
  estimatedIncludedBytes: number;
  includedAssets: number;
  connectedAssets: number;
  profile: "connected" | "portable" | "custom";
  issues: PreflightIssue[];
}
export type ExportFormat = "zip" | "folder" | "archive" | "embed";
export interface ExampleConnection {
  id: string;
  title: string;
  description: string;
  kind: "cog" | "pmtiles" | "geoparquet" | "xyz";
  locator: string;
  tileType?: "raster" | "vector";
  attribution: string;
  camera: {
    center: [number, number];
    zoom: number;
    bearing: number;
    pitch: number;
  };
}
export interface ExampleCatalog {
  stories: Array<{
    id: string;
    title: string;
    description: string;
    chapterCount: number;
    formats: string[];
  }>;
  connections: ExampleConnection[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error(
      "The local Earth Stories service is not responding. Return to the terminal, confirm yarn dev is still running, then retry.",
    );
  }
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in (body as object) &&
        typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "Earth Stories could not complete that request",
    );
  }
  return body as T;
}

export function getExamples(): Promise<ExampleCatalog> {
  return request("/api/examples");
}

export async function createExampleStory(id: string): Promise<StoryProject> {
  return storyProjectSchema.parse(
    await request<unknown>(`/api/examples/stories/${encodeURIComponent(id)}`, {
      method: "POST",
    }),
  );
}

export function listProjects(): Promise<ProjectSummary[]> {
  return request("/api/projects");
}

export async function createProject(title: string): Promise<StoryProject> {
  const value = await request<unknown>("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return storyProjectSchema.parse(value);
}

export async function openProject(id: string): Promise<StoryProject> {
  return storyProjectSchema.parse(
    await request<unknown>(`/api/projects/${encodeURIComponent(id)}`),
  );
}

export async function saveProject(
  project: StoryProject,
): Promise<StoryProject> {
  const value = await request<unknown>(
    `/api/projects/${encodeURIComponent(project.id)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(project),
    },
  );
  return storyProjectSchema.parse(value);
}

export async function importAsset(
  projectId: string,
  file: File,
): Promise<ImportedAsset> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/assets?filename=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    },
  );
  const value = (await response.json()) as ImportedAsset | { error?: string };
  if (!response.ok)
    throw new Error(
      "error" in value && value.error ? value.error : "Could not import asset",
    );
  return value as ImportedAsset;
}

export async function getPublicationPreflight(
  projectId: string,
): Promise<PublicationPreflight> {
  return request(
    `/api/projects/${encodeURIComponent(projectId)}/export/preflight`,
  );
}

export async function exportProject(
  projectId: string,
  format: ExportFormat,
  options: {
    mapSnapshots?: Record<string, string>;
    publicationUrl?: string;
  } = {},
): Promise<{
  blob?: Blob;
  filename?: string;
  directory?: string;
  snippet?: string;
  buildId?: string;
}> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/export?format=${format}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(options),
    },
  );
  if (!response.ok) {
    const value = (await response.json()) as { error?: string };
    throw new Error(value.error ?? "Could not export publication");
  }
  if (format === "zip" || format === "archive") {
    const disposition = response.headers.get("content-disposition") ?? "";
    return {
      blob: await response.blob(),
      filename:
        disposition.match(/filename="([^"]+)"/)?.[1] ??
        `${projectId}.${format === "zip" ? "zip" : "html"}`,
    };
  }
  return (await response.json()) as {
    directory?: string;
    snippet?: string;
    buildId?: string;
  };
}
