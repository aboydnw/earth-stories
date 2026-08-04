import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { isPrivateNetworkHost, validateRemoteUrl } from "./remote-url.js";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function authorize(url: URL): Promise<void> {
  validateRemoteUrl(url.toString());
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return;
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateNetworkHost(address))
  )
    throw new Error("Remote assets cannot resolve to private network hosts.");
}

export async function authorizedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  let url = validateRemoteUrl(input);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    await authorize(url);
    const response = await fetch(url, { ...init, redirect: "manual" });
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
