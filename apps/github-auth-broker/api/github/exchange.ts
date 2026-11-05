import { createBroker, readConfig } from "../../src/broker.js";

// Web exports bypass Vercel's legacy req/res helpers and their eager body parser.
const handle = createBroker(readConfig(process.env));
export {
  handle as POST,
  handle as GET,
  handle as HEAD,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
