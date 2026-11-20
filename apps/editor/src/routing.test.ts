import { describe, expect, it } from "vitest";
import { parseRoute, routePath } from "./routing";

describe("editor routes", () => {
  it("parses story and preview routes", () => {
    expect(parseRoute("/stories/story-1")).toEqual({
      page: "story",
      storyId: "story-1",
      preview: false,
    });
    expect(parseRoute("/stories/story-1/preview")).toEqual({
      page: "story",
      storyId: "story-1",
      preview: true,
    });
  });

  it("round trips dataset ids", () => {
    const route = { page: "data", datasetId: "project:source" } as const;
    expect(parseRoute(routePath(route))).toEqual(route);
  });

  it("falls back safely for malformed URL escapes", () => {
    expect(parseRoute("/stories/%")).toEqual({ page: "stories" });
  });
});

it("round trips a generation candidate preview without treating it as a story", () => {
  const route = { page: "create", jobId: "job-1", preview: true } as const;
  expect(routePath(route)).toBe("/create/job-1/preview");
  expect(parseRoute(routePath(route))).toEqual(route);
  expect(parseRoute("/create")).toEqual({
    page: "create",
    jobId: null,
    preview: false,
  });
});
