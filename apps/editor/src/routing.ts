export type AppRoute =
  | { page: "stories" }
  | { page: "story"; storyId: string; preview: boolean }
  | { page: "data"; datasetId: string | null };

export function parseRoute(pathname: string): AppRoute {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments[0] === "stories" && segments[1])
    return {
      page: "story",
      storyId: segments[1],
      preview: segments[2] === "preview",
    };
  if (segments[0] === "data")
    return { page: "data", datasetId: segments[1] ?? null };
  return { page: "stories" };
}

export function routePath(route: AppRoute) {
  if (route.page === "story")
    return `/stories/${encodeURIComponent(route.storyId)}${route.preview ? "/preview" : ""}`;
  if (route.page === "data")
    return route.datasetId
      ? `/data/${encodeURIComponent(route.datasetId)}`
      : "/data";
  return "/";
}
