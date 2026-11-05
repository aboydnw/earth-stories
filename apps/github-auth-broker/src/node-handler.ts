import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { createBroker, readConfig, reply } from "./broker.js";

export function createNodeHandler(env: NodeJS.ProcessEnv = process.env) {
  const broker = createBroker(readConfig(env));
  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(",") : value);
      }
      const method = request.method ?? "GET";
      const webRequest = new Request(
        new URL(request.url ?? "/", "http://broker.invalid"),
        {
          method,
          headers,
          ...(method !== "GET" && method !== "HEAD"
            ? {
                body: Readable.toWeb(request) as ReadableStream<Uint8Array>,
                duplex: "half",
              }
            : {}),
        } as RequestInit,
      );
      await send(await broker(webRequest), response);
    } catch {
      if (!response.headersSent)
        await send(reply(400, { error: "Invalid request" }), response);
      else response.end();
    }
  };
}

async function send(result: Response, response: ServerResponse) {
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(await result.text());
}
