export function isMissingJobError(cause: unknown): boolean {
  return cause instanceof Error && "status" in cause && cause.status === 404;
}
