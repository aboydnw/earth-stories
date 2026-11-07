import { createBroker, readConfig } from "../../src/broker.js";

// Preserve Web request streaming and the shared handler's bounded parsing.
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
