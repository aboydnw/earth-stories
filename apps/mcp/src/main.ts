import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServiceClient } from "./client.js";
import { createMcpServer } from "./server.js";

const baseUrl =
  process.env.EARTH_STORIES_SERVICE_URL ?? "http://127.0.0.1:4317";
const client = createServiceClient(baseUrl);

try {
  await client.health();
} catch {
  // stdout carries the protocol, so every human-facing line goes to stderr.
  process.stderr.write(
    `The Earth Stories service is not reachable at ${baseUrl}. Start the desktop application or run \`yarn dev\`, then reconnect.\n`,
  );
  process.exit(1);
}

await createMcpServer(client).connect(new StdioServerTransport());
