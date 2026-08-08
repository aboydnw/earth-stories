// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryProject } from "@earth-stories/story-schema";

const { getPreflight } = vi.hoisted(() => ({ getPreflight: vi.fn() }));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  getPublicationPreflight: getPreflight,
}));

import { usePublicationReadiness } from "./usePublicationReadiness";

function project(
  id: string,
  updated = "2026-08-08T00:00:00Z",
  profile: StoryProject["publication"]["profile"] = "connected",
) {
  return {
    id,
    metadata: { updated },
    publication: { profile },
  } as StoryProject;
}
function preflight(
  id: string,
  profile: "connected" | "portable" | "custom" = "connected",
) {
  return {
    ready: true,
    projectId: id,
    buildId: "build",
    estimatedIncludedBytes: 0,
    includedAssets: 0,
    connectedAssets: 0,
    profile,
    issues: [],
  };
}

describe("usePublicationReadiness", () => {
  beforeEach(() => getPreflight.mockReset());

  it("caches by saved revision and marks prior same-project results stale", async () => {
    getPreflight.mockResolvedValue(preflight("one"));
    const { result, rerender } = renderHook(
      ({ value }) => usePublicationReadiness(value),
      { initialProps: { value: project("one") } },
    );
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.state.status).toBe("ready");
    await act(async () => {
      await result.current.load();
    });
    expect(getPreflight).toHaveBeenCalledTimes(1);
    rerender({ value: project("one", "2026-08-09T00:00:00Z") });
    await waitFor(() => expect(result.current.state.status).toBe("stale"));
  });

  it("ignores a late response after switching projects", async () => {
    let resolveOne!: (value: ReturnType<typeof preflight>) => void;
    let resolveTwo!: (value: ReturnType<typeof preflight>) => void;
    getPreflight
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOne = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveTwo = resolve;
          }),
      );
    const { result, rerender } = renderHook(
      ({ value }) => usePublicationReadiness(value),
      { initialProps: { value: project("one") } },
    );
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.load();
    });
    rerender({ value: project("two") });
    let second!: Promise<unknown>;
    act(() => {
      second = result.current.load();
    });
    resolveTwo(preflight("two"));
    await act(async () => {
      await second;
    });
    resolveOne(preflight("one"));
    await act(async () => {
      await first;
    });
    expect(result.current.state.result?.projectId).toBe("two");
  });
});
