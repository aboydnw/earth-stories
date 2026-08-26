import { writeSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServiceClient } from "./client.js";
import { resolveServiceUrl } from "./loopback.js";
import { createMcpServer } from "./server.js";

/**
 * Report a startup failure and stop.
 *
 * stdout carries the protocol, so every human-facing line goes to stderr, and
 * the write is synchronous: a piped stderr can lose a buffered write when
 * process.exit follows immediately.
 */
function fail(message: string): never {
  writeSync(process.stderr.fd, `${message}\n`);
  process.exit(1);
}

let baseUrl: string;
try {
  baseUrl = resolveServiceUrl(process.env.EARTH_STORIES_SERVICE_URL);
} catch (cause) {
  fail(cause instanceof Error ? cause.message : String(cause));
}

const client = createServiceClient(baseUrl);

try {
  await client.health();
} catch {
  fail(
    `The Earth Stories service is not reachable at ${baseUrl}. Start the desktop application or run \`yarn dev\`, then reconnect.`,
  );
}

await createMcpServer(client).connect(new StdioServerTransport());
