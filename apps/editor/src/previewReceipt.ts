const prefix = "earth-stories:preview-receipt:";
const memory = new Map<string, string>();

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function readPreviewReceipt(projectId: string): string | null {
  const key = `${prefix}${projectId}`;
  const raw = storage()?.getItem(key) ?? memory.get(key) ?? null;
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as {
      projectId?: unknown;
      revision?: unknown;
    };
    if (value.projectId === projectId && typeof value.revision === "string")
      return value.revision;
  } catch {
    // Corrupt session values are discarded below.
  }
  storage()?.removeItem(key);
  memory.delete(key);
  return null;
}

export function recordPreviewReceipt(
  projectId: string,
  revision: string,
): void {
  const key = `${prefix}${projectId}`;
  const value = JSON.stringify({ projectId, revision });
  memory.set(key, value);
  try {
    storage()?.setItem(key, value);
  } catch {
    // The in-memory copy remains available when session storage is blocked.
  }
}

export function previewMatchesRevision(
  projectId: string,
  revision: string,
): boolean {
  return readPreviewReceipt(projectId) === revision;
}

export function clearPreviewReceipt(projectId: string): void {
  const key = `${prefix}${projectId}`;
  memory.delete(key);
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing else to clear.
  }
}
