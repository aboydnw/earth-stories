import { Readable } from "node:stream";
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

it("returns original inputs only through the explicit brief recovery endpoint", async () => {
  const brief = {
    title: "Birds",
    references: [{ kind: "text", text: "Original notes" }],
  };
  const getBrief = vi.fn().mockResolvedValue(brief);
  const response = { writeHead: vi.fn(), end: vi.fn() };
  await generationRoute(
    { method: "GET" } as never,
    response as never,
    new URL("http://localhost/api/generation/jobs/job/brief"),
    { getBrief } as unknown as GenerationJobs,
  );
  expect(getBrief).toHaveBeenCalledWith("job");
  expect(JSON.parse(response.end.mock.calls[0]![0])).toEqual(brief);
});

it.each([
  { unexpected: true },
  {
    maps: Object.fromEntries(
      Array.from({ length: 13 }, (_, i) => [String(i), "image"]),
    ),
  },
  { maps: { preview: "x".repeat(12 * 1024 * 1024 + 1) } },
])(
  "rejects invalid enhancement bodies before starting a job",
  async (invalid) => {
    const start = vi.fn();
    const response = { writeHead: vi.fn(), end: vi.fn() };
    const request = Object.assign(
      Readable.from([
        Buffer.from(
          JSON.stringify({
            projectId: "story",
            sourceUpdated: "2026-11-20T00:00:00.000Z",
            brief: {},
            ...invalid,
          }),
        ),
      ]),
      { method: "POST" },
    );
    await generationRoute(
      request as never,
      response as never,
      new URL("http://localhost/api/generation/enhance"),
      { start } as unknown as GenerationJobs,
    );
    expect(response.writeHead.mock.calls[0]![0]).toBe(400);
    expect(start).not.toHaveBeenCalled();
  },
);

it("forwards a valid enhancement request including map limits and source version", async () => {
  const input = {
    projectId: "story",
    sourceUpdated: "2026-11-20T00:00:00.000Z",
    brief: { title: "Visuals" },
    maps: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        String(i),
        i === 0 ? "x".repeat(12 * 1024 * 1024) : "image",
      ]),
    ),
  };
  const start = vi
    .fn()
    .mockResolvedValue({ id: "job", brief: { references: ["private"] } });
  const response = { writeHead: vi.fn(), end: vi.fn() };
  const request = Object.assign(
    Readable.from([Buffer.from(JSON.stringify(input))]),
    { method: "POST" },
  );
  await generationRoute(
    request as never,
    response as never,
    new URL("http://localhost/api/generation/enhance"),
    { start } as unknown as GenerationJobs,
  );
  expect(response.writeHead.mock.calls[0]![0]).toBe(202);
  expect(start).toHaveBeenCalledWith(
    input.brief,
    input.projectId,
    input.maps,
    input.sourceUpdated,
  );
  expect(JSON.parse(response.end.mock.calls[0]![0])).toEqual({
    id: "job",
    brief: { references: [] },
  });
});

it("normalizes uploaded artwork without requiring ChatGPT or modifying a story", async () => {
  const { createCanvas } = await import("@napi-rs/canvas");
  const data = (await createCanvas(300, 200).encode("png")).toString("base64");
  const response = { writeHead: vi.fn(), end: vi.fn() };
  const req = Object.assign(Readable.from([JSON.stringify({ data })]), {
    method: "POST",
  });
  await generationRoute(
    req as never,
    response as never,
    new URL("http://localhost/api/generation/artwork/image"),
    { provider: { configured: false } } as never,
  );
  expect(response.writeHead.mock.calls[0]?.[0]).toBe(200);
  expect(JSON.parse(response.end.mock.calls[0]?.[0])).toMatchObject({
    width: 300,
    height: 200,
    hasTransparency: true,
  });
});
