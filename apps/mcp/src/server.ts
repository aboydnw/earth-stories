import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceClient } from "./client.js";
import { buildTools } from "./tools.js";

const CHAPTER_REFERENCE = `# Earth Stories chapter types

Every chapter has \`id\`, \`title\`, and \`narrative\` (markdown). A camera is
\`{ center: [lng, lat], zoom, bearing, pitch }\`.

- prose: no other fields.
- map: \`sourceId\`, optional \`overlaySourceIds\`, \`camera\`, optional
  \`transition\` ("fly-to" | "instant"), optional \`temporalPosition\` (0-1).
- scrolly: the map fields plus optional \`overlayPosition\` ("left" | "right").
- image: \`sourceId\` (an image source), \`alt\`, \`caption\`.
- chart: \`sourceId\`, \`chartType\` ("bar" | "line") and \`series\`, one of
  \`{ kind: "table" }\` with \`xColumn\`/\`yColumn\` over a CSV source,
  \`{ kind: "histogram", bins }\` over a COG source, or
  \`{ kind: "timeseries", point: [lng, lat] }\` over a time-aware Zarr source.
- video: \`provider\` ("youtube" | "vimeo"), \`videoId\`, \`originalUrl\`.
- flyover: \`sourceId\` (or null), \`overlaySourceIds\`, at least two
  \`keyframes\` (a camera plus \`caption\`), and \`scrollLength\` (0.5-5).

Call read_project first to see how an existing story wires sources to chapters.`;

/** Expose the local authoring workspace to an MCP client on this computer. */
export function createMcpServer(client: ServiceClient) {
  const server = new McpServer({ name: "earth-stories", version: "0.1.0" });
  for (const tool of buildTools(client)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: Record<string, unknown>) => {
        try {
          return {
            content: [
              { type: "text" as const, text: await tool.run(args ?? {}) },
            ],
          };
        } catch (cause) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: cause instanceof Error ? cause.message : String(cause),
              },
            ],
          };
        }
      },
    );
  }
  server.registerResource(
    "chapter-reference",
    "earth-stories://schema/chapter",
    {
      description: "Every chapter type and the fields it requires",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: CHAPTER_REFERENCE }],
    }),
  );
  return server;
}
