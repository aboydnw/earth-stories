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
