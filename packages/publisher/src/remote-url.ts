const IPV4_PRIVATE = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^198\.(?:1[89])\./,
  /^(?:22[4-9]|23\d)\./,
  /^(?:24\d|25[0-5])\./,
] as const;

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false;
  if (parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127) return true;
  if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) return true;
  return IPV4_PRIVATE.some((pattern) => pattern.test(hostname));
}

export function isPrivateNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (isPrivateIpv4(host)) return true;
  if (host === "::" || host === "::1") return true;
  if (/^(?:fc|fd|fe[89ab]|ff)/i.test(host)) return true;
  if (host.startsWith("::ffff:")) return true;
  return false;
}

export function validateRemoteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Remote assets must use a valid HTTP or HTTPS URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Remote assets must use HTTP or HTTPS.");
  if (url.username || url.password)
    throw new Error("Remote asset URLs cannot contain credentials.");
  if (isPrivateNetworkHost(url.hostname))
    throw new Error("Remote assets cannot use private or local network hosts.");
  return url;
}
