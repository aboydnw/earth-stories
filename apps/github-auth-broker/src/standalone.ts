import { createServer } from "node:http";
import { readConfig } from "./broker.js";
import { createNodeHandler } from "./node-handler.js";

if (!readConfig(process.env))
  throw new Error("GitHub broker configuration is missing or invalid");
const port = Number(process.env.PORT ?? "4320");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
const server = createServer(createNodeHandler());
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.maxHeadersCount = 32;
// Local debugging only. Public hosting must terminate HTTPS in front of the broker.
server.listen(port, "127.0.0.1", () =>
  console.log(`GitHub auth broker listening on loopback port ${port}`),
);
