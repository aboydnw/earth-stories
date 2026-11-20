import type { IncomingMessage, ServerResponse } from "node:http";
import type { GenerationJob } from "@earth-stories/story-schema";
import type { GenerationJobs } from "./jobs.js";
const publicJob = (job: GenerationJob) => ({
  ...job,
  brief: { ...job.brief, references: [] },
});
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 140 * 1024 * 1024)
      throw new Error("Generation request exceeds 140 MiB.");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export async function generationRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  jobs: GenerationJobs,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/generation/")) return false;
  try {
    if (url.pathname === "/api/generation/status" && req.method === "GET") {
      json(res, 200, {
        configured: jobs.provider.configured,
        running: jobs.activity() > 0,
      });
      return true;
    }
    if (url.pathname === "/api/generation/jobs" && req.method === "POST") {
      json(res, 202, publicJob(await jobs.start(await body(req))));
      return true;
    }
    const match = /^\/api\/generation\/jobs\/([a-zA-Z0-9_-]+)(?:\/(.*))?$/.exec(
      url.pathname,
    );
    if (!match) {
      json(res, 404, { error: "Generation route not found." });
      return true;
    }
    const id = match[1]!,
      action = match[2];
    if (!action && req.method === "GET")
      json(res, 200, publicJob(await jobs.get(id)));
    else if (!action && req.method === "DELETE") {
      await jobs.discard(id);
      json(res, 200, { discarded: true });
    } else if (action === "cancel" && req.method === "POST")
      json(res, 200, publicJob(await jobs.cancel(id)));
    else if (action === "retry" && req.method === "POST")
      json(res, 202, publicJob(await jobs.retry(id)));
    else if (action === "accept" && req.method === "POST")
      json(res, 200, await jobs.accept(id));
    else if (action === "preview" && req.method === "GET")
      json(res, 200, await jobs.preview(id));
    else if (action?.startsWith("assets/") && req.method === "GET") {
      const job = await jobs.get(id);
      if (!job.candidate?.assets.some((a) => a.path === action))
        throw new Error("Asset is not part of this candidate.");
      const bytes = await jobs.asset(id, action);
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      });
      res.end(bytes);
    } else json(res, 405, { error: "Method not allowed." });
  } catch (cause) {
    json(res, 400, {
      error:
        cause instanceof Error ? cause.message : "Generation request failed.",
    });
  }
  return true;
}
