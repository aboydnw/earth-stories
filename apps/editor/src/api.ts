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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
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

export async function exportProject(
  projectId: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/export`,
    { method: "POST" },
  );
  if (!response.ok) {
    const value = (await response.json()) as { error?: string };
    throw new Error(value.error ?? "Could not export publication");
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  return {
    blob: await response.blob(),
    filename:
      disposition.match(/filename="([^"]+)"/)?.[1] ?? `${projectId}.zip`,
  };
}
