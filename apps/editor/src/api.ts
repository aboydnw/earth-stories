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
