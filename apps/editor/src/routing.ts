export type AppRoute =
  | { page: "stories" }
  | { page: "enhance"; storyId: string; jobId: string | null; preview: boolean }
  | { page: "create"; jobId: string | null; preview: boolean }
  | { page: "story"; storyId: string; preview: boolean }
  | { page: "data"; datasetId: string | null };

export function parseRoute(pathname: string): AppRoute {
  let segments: string[];
  try {
    segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return { page: "stories" };
  }
  if (segments[0] === "stories" && segments[1] && segments[2] === "enhance")
    return {
      page: "enhance",
      storyId: segments[1],
      jobId: segments[3] ?? null,
      preview: segments[4] === "preview",
    };
  if (segments[0] === "stories" && segments[1])
    return {
      page: "story",
      storyId: segments[1],
      preview: segments[2] === "preview",
    };
  if (segments[0] === "create")
    return {
      page: "create",
      jobId: segments[1] ?? null,
      preview: segments[2] === "preview",
    };
  if (segments[0] === "data")
    return { page: "data", datasetId: segments[1] ?? null };
  return { page: "stories" };
}

export function routePath(route: AppRoute) {
  if (route.page === "enhance")
    return `/stories/${encodeURIComponent(route.storyId)}/enhance${route.jobId ? `/${encodeURIComponent(route.jobId)}${route.preview ? "/preview" : ""}` : ""}`;
  if (route.page === "story")
    return `/stories/${encodeURIComponent(route.storyId)}${route.preview ? "/preview" : ""}`;
  if (route.page === "create")
    return `/create${route.jobId ? `/${encodeURIComponent(route.jobId)}${route.preview ? "/preview" : ""}` : ""}`;
  if (route.page === "data")
    return route.datasetId
      ? `/data/${encodeURIComponent(route.datasetId)}`
      : "/data";
  return "/";
}
