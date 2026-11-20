import { expect, it, vi } from "vitest";
import { generationRoute } from "./routes.js";
import type { GenerationJobs } from "./jobs.js";
it("routes status without exposing provider credentials and rejects unsupported paths", async () => {
  const jobs = {
    provider: { configured: true, accessToken: "private" },
    activity: () => 0,
  } as unknown as GenerationJobs;
  const response = { writeHead: vi.fn(), end: vi.fn() } as never;
  expect(
    await generationRoute(
      { method: "GET" } as never,
      response,
      new URL("http://localhost/api/generation/status"),
      jobs,
    ),
  ).toBe(true);
  expect(
    JSON.stringify(
      (response as { end: ReturnType<typeof vi.fn> }).end.mock.calls,
    ),
  ).not.toContain("private");
  expect(
    await generationRoute(
      { method: "GET" } as never,
      response,
      new URL("http://localhost/api/other"),
      jobs,
    ),
  ).toBe(false);
});
it("accepts through the job manager and returns its exact receipt", async () => {
  const accept = vi
    .fn()
    .mockResolvedValue({ projectId: "story-job", candidateDigest: "digest" });
  const jobs = { accept } as unknown as GenerationJobs;
  const response = { writeHead: vi.fn(), end: vi.fn() };
  await generationRoute(
    { method: "POST" } as never,
    response as never,
    new URL("http://localhost/api/generation/jobs/job/accept"),
    jobs,
  );
  expect(accept).toHaveBeenCalledWith("job");
  expect(JSON.parse(response.end.mock.calls[0]![0])).toEqual({
    projectId: "story-job",
    candidateDigest: "digest",
  });
});
