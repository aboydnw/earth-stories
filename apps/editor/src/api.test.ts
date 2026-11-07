import { afterEach, describe, expect, it, vi } from "vitest";
import { getExamples } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("editor API errors", () => {
  it("preserves status and a generic message for an empty non-JSON failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 502 })),
    );

    const error = await getExamples().catch((cause: unknown) => cause);

    expect(error).toMatchObject({
      message: "Earth Stories could not complete that request",
      status: 502,
    });
  });
});

describe("GitHub App API contract", () => {
  it("uses the local connection service without returning credentials to the UI", async () => {
    const {
      getGitHubConnection,
      connectGitHub,
      disconnectGitHub,
      cancelGitHubConnection,
      getGitHubRepositories,
      startPublish,
    } = await import("./api");
    const snapshot = {
      configured: true,
      status: "disconnected",
      login: null,
      authorizationUrl: null,
      installationUrl:
        "https://github.com/apps/earth-stories/installations/new",
      error: null,
    };
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(snapshot), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await getGitHubConnection()).toEqual(snapshot);
    await connectGitHub();
    await disconnectGitHub();
    await cancelGitHubConnection();
    expect(fetchMock.mock.calls.slice(0, 4)).toEqual([
      ["/api/github/connection", undefined],
      ["/api/github/connection", { method: "POST" }],
      ["/api/github/connection", { method: "DELETE" }],
      ["/api/github/connection/cancel", { method: "POST" }],
    ]);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ repositories: [{ id: 42 }] }), {
        status: 200,
      }),
    );
    expect(await getGitHubRepositories()).toEqual([{ id: 42 }]);
    const reviewedRepository = {
      login: "mapper",
      id: 42,
      installationId: 7,
      owner: "mapper",
      name: "field-notes",
    };
    await startPublish("a story", {
      repositoryId: 42,
      reviewedRepository,
      mapSnapshots: {},
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/projects/a%20story/publish",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repositoryId: 42,
          reviewedRepository,
          mapSnapshots: {},
        }),
      },
    );
  });
});
