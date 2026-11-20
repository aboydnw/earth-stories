const prefix = "earth-stories:preview-receipt:";
const memory = new Map<string, string>();
const unsynced = new Set<string>();

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readPreviewReceipt(projectId: string): string | null {
  const key = `${prefix}${projectId}`;
  let raw: string | null;
  try {
    const available = storage();
    raw =
      unsynced.has(key) || !available
        ? (memory.get(key) ?? null)
        : available.getItem(key);
  } catch {
    raw = memory.get(key) ?? null;
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as {
      projectId?: unknown;
      revision?: unknown;
    };
    if (value.projectId === projectId && typeof value.revision === "string")
      return value.revision;
  } catch {
    // Corrupt stored values are discarded below.
  }
  try {
    storage()?.removeItem(key);
  } catch {
    // The in-memory copy is cleared below.
  }
  memory.delete(key);
  unsynced.delete(key);
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
    const available = storage();
    if (available) {
      available.setItem(key, value);
      unsynced.delete(key);
    } else unsynced.add(key);
  } catch {
    unsynced.add(key);
    // The in-memory copy remains available when local storage is blocked.
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
  unsynced.delete(key);
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing else to clear.
  }
}
