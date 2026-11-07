import { createBroker, readConfig } from "../src/broker.js";
const broker = createBroker(readConfig(process.env));
const handle = (request: Request) => {
  const url = new URL(request.url);
  // Support either path representation across Vercel rewrite routing.
  if (url.pathname === "/api/health") {
    url.pathname = "/health";
    return broker(new Request(url, request));
  }
  return broker(request);
};
export {
  handle as GET,
  handle as HEAD,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
