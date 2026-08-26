const LOOPBACK_HOSTS = new Set(["localhost", "::1", "[::1]"]);
// RFC 1122 reserves all of 127.0.0.0/8 for loopback, not just 127.0.0.1.
const IPV4_LOOPBACK = /^127(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/**
 * Resolve the service endpoint, refusing anything but a loopback host.
 *
 * The server has no authentication of its own: it relies on the project
 * service being reachable only from this computer. Allowing a remote endpoint
 * would quietly move that trust boundary, so an override that is not loopback
 * is an error rather than a warning.
 */
export function resolveServiceUrl(value: string | undefined): string {
  const raw = value?.trim() || "http://127.0.0.1:4317";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`EARTH_STORIES_SERVICE_URL is not a URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error(
      `EARTH_STORIES_SERVICE_URL must be an http(s) URL, not ${parsed.protocol}`,
    );
  if (
    !LOOPBACK_HOSTS.has(parsed.hostname) &&
    !IPV4_LOOPBACK.test(parsed.hostname)
  )
    throw new Error(
      `EARTH_STORIES_SERVICE_URL must point at this computer. ${parsed.hostname} is not a loopback host.`,
    );
  return parsed.origin;
}
