import { createBroker, readConfig, type BrokerEnvironment } from "./broker.js";

/** Cloudflare Workers entrypoint. Bindings stay server-side; never log them. */
export default {
  fetch(request: Request, env: BrokerEnvironment): Promise<Response> {
    return createBroker(readConfig(env))(request);
  },
};
