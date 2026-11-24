import { prepareArtworkImage } from "./artwork.js";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { GenerationJob } from "@earth-stories/story-schema";
import type { ChatGPTConnection } from "../chatgpt/connection.js";
import { ChatGPTProvider } from "./chatgpt-provider.js";
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
async function body(req: IncomingMessage, limit = 140 * 1024 * 1024) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw new Error("Generation request exceeds its size limit.");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export async function generationRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  jobs: GenerationJobs,
  connection?: ChatGPTConnection,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/generation/")) return false;
  try {
    if (
      url.pathname === "/api/generation/artwork/image" &&
      req.method === "POST"
    ) {
      const input = z
        .object({ data: z.unknown() })
        .strict()
        .parse(await body(req, 29 * 1024 * 1024));
      json(res, 200, await prepareArtworkImage(input.data));
      return true;
    }
    if (url.pathname.startsWith("/api/generation/connection") && connection) {
      const action = url.pathname.slice("/api/generation/connection".length);
      if (req.method === "GET" && !action) json(res, 200, connection.status());
      else if (req.method === "POST" && !action) {
        if (jobs.activity())
          throw new Error(
            "Cancel generation before changing your ChatGPT connection.",
          );
        const input = await body(req, 4096);
        if (
          input?.accountId !== undefined &&
          typeof input.accountId !== "string"
        )
          throw new Error("Invalid account selection.");
        json(res, 200, await connection.start(input?.accountId));
      } else if (req.method === "POST" && action === "/cancel") {
        await connection.cancel();
        json(res, 200, connection.status());
      } else if (req.method === "DELETE" && !action) {
        await jobs.cancelActive();
        await connection.signOut();
        json(res, 200, connection.status());
      } else json(res, 405, { error: "Method not allowed." });
      return true;
    }
    if (
      url.pathname === "/api/generation/models" &&
      req.method === "GET" &&
      jobs.provider instanceof ChatGPTProvider
    ) {
      json(res, 200, await jobs.provider.models());
      return true;
    }
    if (url.pathname === "/api/generation/status" && req.method === "GET") {
      json(res, 200, {
        configured: jobs.provider.configured,
        running: jobs.activity() > 0,
      });
      return true;
    }
    if (url.pathname === "/api/generation/enhance" && req.method === "POST") {
      const input = z
        .object({
          projectId: z.string().min(1).max(64),
          sourceUpdated: z.string().datetime(),
          brief: z.unknown(),
          maps: z
            .record(z.string(), z.string().max(12 * 1024 * 1024))
            .refine((v) => Object.keys(v).length <= 12)
            .default({}),
        })
        .strict()
        .parse(await body(req));
      json(
        res,
        202,
        publicJob(
          await jobs.start(
            input.brief,
            input.projectId,
            input.maps,
            input.sourceUpdated,
          ),
        ),
      );
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
    else if (action === "brief" && req.method === "GET")
      json(res, 200, await jobs.getBrief(id));
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
