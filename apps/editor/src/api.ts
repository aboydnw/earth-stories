import {
  conversionJobEventSchema,
  storyProjectSchema,
  type ConversionCapability,
  type ConversionJobEvent,
  type ConversionOperation,
  type StoryProject,
} from "@earth-stories/story-schema";
import type { ReadinessArea } from "@earth-stories/publisher/readiness";

export interface ProjectSummary {
  id: string;
  title: string;
  description: string;
  updated: string;
  chapterCount: number;
  isExample: boolean;
  invalidReason?: string;
}

export interface ImportedAsset {
  path: string;
  filename: string;
  sizeBytes: number;
}
export interface PreflightIssue {
  id: string;
  area: ReadinessArea;
  severity: "error" | "warning" | "info";
  message: string;
  resolution?: string;
  resourceId?: string;
  chapterId?: string;
}
export interface PublicationPreflight {
  ready: boolean;
  projectId: string;
  buildId: string | null;
  estimatedIncludedBytes: number;
  requiredDownloadBytes: number;
  unknownDownloadSizes: number;
  availableDiskBytes: number | null;
  needsBuildInternet: boolean;
  needsRuntimeInternet: boolean;
  includedAssets: number;
  connectedAssets: number;
  profile: "connected" | "portable" | "custom" | "offline";
  issues: PreflightIssue[];
}
export type ExportFormat = "zip" | "folder" | "archive" | "embed";
export interface ExampleConnection {
  id: string;
  title: string;
  description: string;
  kind:
    "cog" | "pmtiles" | "geoparquet" | "xyz" | "zarr" | "trajectory" | "copc";
  locator: string;
  tileType?: "raster" | "vector";
  attribution: string;
  config?: Record<string, unknown>;
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
    authoringConnectivity: "local" | "network-required";
  }>;
  connections: ExampleConnection[];
}

export interface ConversionJobSnapshot {
  id: string;
  projectId: string;
  status:
    | "queued"
    | "awaiting-approval"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled";
  events: ConversionJobEvent[];
  createdAt: string;
  updatedAt: string;
}
export interface RemoteSourceDiscovery {
  url: string;
  kind:
    | "cog"
    | "pmtiles"
    | "geoparquet"
    | "xyz"
    | "zarr"
    | "trajectory"
    | "copc"
    | "unknown";
  contentType: string | null;
  sizeBytes: number | null;
  cors: boolean;
  byteRanges: boolean;
  reachable: boolean;
  issues: string[];
  details: {
    minZoom?: number;
    maxZoom?: number;
    sourceLayers?: string[];
    variables?: Array<{
      name: string;
      dimensions: string[];
      shape: number[];
      dataType?: string;
    }>;
  };
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
    throw Object.assign(
      new Error(
        "error" in (body as object) &&
          typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : "Earth Stories could not complete that request",
      ),
      { status: response.status },
    );
  }
  return body as T;
}

export function getExamples(): Promise<ExampleCatalog> {
  return request("/api/examples");
}

export function discoverSource(url: string): Promise<RemoteSourceDiscovery> {
  return request("/api/discover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
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

export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const value = (await response.json()) as { error?: string };
    throw new Error(value.error ?? "Could not remove the story");
  }
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

function parseConversionJob(value: unknown): ConversionJobSnapshot {
  if (!value || typeof value !== "object")
    throw new Error("The conversion service returned an invalid job");
  const job = value as Omit<ConversionJobSnapshot, "events"> & {
    events?: unknown[];
  };
  return {
    ...job,
    events: (job.events ?? []).map((event) =>
      conversionJobEventSchema.parse(event),
    ),
  };
}

export async function startConversion(
  projectId: string,
  input: {
    operation: ConversionOperation;
    capability: ConversionCapability;
    assetPath: string;
    options?: Record<string, unknown>;
  },
): Promise<ConversionJobSnapshot> {
  return parseConversionJob(
    await request<unknown>(
      `/api/projects/${encodeURIComponent(projectId)}/conversions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
  );
}

export async function getConversionJob(
  id: string,
): Promise<ConversionJobSnapshot> {
  return parseConversionJob(
    await request<unknown>(`/api/conversion-jobs/${encodeURIComponent(id)}`),
  );
}

export async function actOnConversionJob(
  id: string,
  action: "acknowledge" | "cancel" | "retry",
): Promise<ConversionJobSnapshot> {
  return parseConversionJob(
    await request<unknown>(
      `/api/conversion-jobs/${encodeURIComponent(id)}/${action}`,
      { method: "POST" },
    ),
  );
}

export async function getPublicationPreflight(
  projectId: string,
): Promise<PublicationPreflight> {
  return request(
    `/api/projects/${encodeURIComponent(projectId)}/export/preflight`,
  );
}

export interface ShareLinkProblem {
  id: string;
  severity: "error" | "warning";
  message: string;
  resolution?: string;
}

export interface ShareLinkReport {
  url: string;
  reachable: boolean;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  imageBytes: number | null;
  problems: ShareLinkProblem[];
}

export async function uploadShareCard(
  projectId: string,
  image: string,
): Promise<{ bytes: number }> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/share-card`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image }),
  });
}

export function shareCardUrl(projectId: string, version = 0): string {
  const path = `/api/projects/${encodeURIComponent(projectId)}/share-card`;
  return version ? `${path}?v=${version}` : path;
}

export type PublishStage =
  | "signing-in"
  | "checking"
  | "building"
  | "preparing-repository"
  | "uploading"
  | "enabling-pages"
  | "waiting-for-site"
  | "verifying"
  | "done";

export interface PublishJobEvent {
  stage: PublishStage;
  severity: "info" | "warning";
  message: string;
  at: string;
}

export interface PublishRecord {
  owner: string;
  repo: string;
  url: string;
  branch: string;
  buildId: string | null;
  publishedAt: string;
}

export interface PublishJob {
  id: string;
  projectId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  stage: PublishStage;
  events: PublishJobEvent[];
  deviceCode: {
    verificationUri: string;
    userCode: string;
    expiresInSeconds: number;
  } | null;
  url: string | null;
  record: PublishRecord | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function startPublish(
  projectId: string,
  options: {
    repo?: string;
    mapSnapshots?: Record<string, string>;
  } = {},
): Promise<PublishJob> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
  });
}

export async function getPublishJob(jobId: string): Promise<PublishJob> {
  return request(`/api/publish-jobs/${encodeURIComponent(jobId)}`);
}

export async function getPublishRecord(
  projectId: string,
): Promise<PublishRecord | null> {
  const body = await request<{ record: PublishRecord | null }>(
    `/api/projects/${encodeURIComponent(projectId)}/publish-record`,
  );
  return body.record;
}

export async function checkShareLink(url: string): Promise<ShareLinkReport> {
  return request("/api/share/link-health", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
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
