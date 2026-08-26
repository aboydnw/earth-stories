import {
  parseStoryProject,
  type StoryProject,
} from "@earth-stories/story-schema";

export type ExportFormat = "zip" | "folder" | "archive" | "embed";

export interface ServiceClient {
  health(): Promise<{ status: string; projectsDirectory: string }>;
  listProjects(): Promise<unknown>;
  readProject(id: string): Promise<StoryProject>;
  createProject(title: string): Promise<StoryProject>;
  saveProject(project: StoryProject): Promise<StoryProject>;
  listExamples(): Promise<unknown>;
  createExampleStory(id: string): Promise<StoryProject>;
  discover(url: string): Promise<unknown>;
  startConversion(
    projectId: string,
    body: Record<string, unknown>,
  ): Promise<unknown>;
  getConversionJob(id: string): Promise<unknown>;
  preflight(projectId: string): Promise<unknown>;
  exportProject(projectId: string, format: ExportFormat): Promise<unknown>;
}

/**
 * HTTP client for the Earth Stories loopback service.
 *
 * Every write goes through the same routes the editor uses, so the service
 * keeps ownership of schema validation, per-project locking, atomic saves, and
 * backups. The origin header is set explicitly because the service rejects
 * mutations from anything but a loopback origin.
 */
export function createServiceClient(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): ServiceClient {
  const origin = new URL(baseUrl).origin;
  async function request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetchImpl(`${origin}${path}`, {
      method,
      headers: {
        origin,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const payload: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Earth Stories service responded ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  }
  const id = (value: string) => encodeURIComponent(value);
  return {
    health: () => request("GET", "/health"),
    listProjects: () => request("GET", "/api/projects"),
    readProject: async (projectId) =>
      parseStoryProject(await request("GET", `/api/projects/${id(projectId)}`)),
    createProject: async (title) =>
      parseStoryProject(await request("POST", "/api/projects", { title })),
    saveProject: async (project) =>
      parseStoryProject(
        await request("PUT", `/api/projects/${id(project.id)}`, project),
      ),
    listExamples: () => request("GET", "/api/examples"),
    createExampleStory: async (storyId) =>
      parseStoryProject(
        await request("POST", `/api/examples/stories/${id(storyId)}`),
      ),
    discover: (url) => request("POST", "/api/discover", { url }),
    startConversion: (projectId, body) =>
      request("POST", `/api/projects/${id(projectId)}/conversions`, body),
    getConversionJob: (jobId) =>
      request("GET", `/api/conversion-jobs/${id(jobId)}`),
    preflight: (projectId) =>
      request("GET", `/api/projects/${id(projectId)}/export/preflight`),
    exportProject: (projectId, format) =>
      request(
        "POST",
        `/api/projects/${id(projectId)}/export?format=${format}`,
        {},
      ),
  };
}
