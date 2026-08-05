import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { Agent } from "undici";
import { isPrivateNetworkHost, validateRemoteUrl } from "./remote-url.js";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

interface AuthorizedAddress {
  address: string;
  family: 4 | 6;
}
async function authorize(url: URL): Promise<AuthorizedAddress> {
  validateRemoteUrl(url.toString());
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  if (literalFamily)
    return { address: hostname, family: literalFamily as 4 | 6 };
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateNetworkHost(address))
  )
    throw new Error("Remote assets cannot resolve to private network hosts.");
  const selected = addresses[0]!;
  return { address: selected.address, family: selected.family as 4 | 6 };
}

const pinnedAgents = new Map<string, Agent>();
function pinnedAgent(url: URL, authorized: AuthorizedAddress): Agent {
  const key = `${url.origin}|${authorized.address}`;
  const existing = pinnedAgents.get(key);
  if (existing) return existing;
  const agent = new Agent({
    connect: {
      lookup: (_hostname, _options, callback) =>
        callback(null, authorized.address, authorized.family),
    },
  });
  pinnedAgents.set(key, agent);
  return agent;
}

export async function authorizedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  let url = validateRemoteUrl(input);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const authorized = await authorize(url);
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      dispatcher: pinnedAgent(url, authorized),
    } as RequestInit & { dispatcher: Agent });
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    const location = response.headers.get("location");
    if (!location)
      throw new Error("Remote server returned an invalid redirect.");
    if (redirects === 5)
      throw new Error("Remote asset redirected too many times.");
    await response.body?.cancel();
    url = validateRemoteUrl(new URL(location, url).toString());
  }
  throw new Error("Remote asset redirected too many times.");
}
