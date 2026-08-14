import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export function isTrustedMutationOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    const parsed = new URL(origin);
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function requireCapability(
  request: IncomingMessage,
  token: string | null,
): boolean {
  if (token === null) return true;
  const authorization = request.headers.authorization;
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  return timingSafeEqual(digest(supplied), digest(token));
}

export function assertCapabilitySecurity(
  token: string | null,
  trustedMutationOriginEnforced: boolean,
): void {
  if (token !== null && !trustedMutationOriginEnforced)
    throw new Error(
      "Capability authorization requires trusted mutation-origin enforcement.",
    );
}
