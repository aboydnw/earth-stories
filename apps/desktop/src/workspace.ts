import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, join, posix, win32 } from "node:path";

export type WorkspaceFindingCode =
  | "not-found"
  | "not-directory"
  | "create-file-failed"
  | "write-file-failed"
  | "sync-file-failed"
  | "rename-failed"
  | "create-subdirectory-failed"
  | "remove-subdirectory-failed"
  | "exclusive-create-failed";

export interface WorkspaceFinding {
  code: WorkspaceFindingCode;
  severity: "error" | "warning";
  message: string;
}

export interface WorkspaceValidationResult {
  ok: boolean;
  findings: WorkspaceFinding[];
}

export interface WorkspaceProbeOperations {
  stat: typeof stat;
  open: typeof open;
  rename: typeof rename;
  mkdir: typeof mkdir;
  rm: typeof rm;
}

const defaultProbeOperations: WorkspaceProbeOperations = {
  stat,
  open,
  rename,
  mkdir,
  rm,
};

function validationError(
  code: WorkspaceFindingCode,
  message: string,
): WorkspaceValidationResult {
  return {
    ok: false,
    findings: [{ code, severity: "error", message }],
  };
}

function hasErrorCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && "code" in cause && cause.code === code;
}

export function defaultWorkspace(
  documentsDirectory: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const path = platform === "win32" ? win32 : posix;
  return path.resolve(documentsDirectory, "Earth Stories");
}

export async function looksLikeWorkspace(candidate: string): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(candidate, { withFileTypes: true });
  } catch (cause) {
    if (hasErrorCode(cause, "ENOENT") || hasErrorCode(cause, "ENOTDIR")) {
      return false;
    }
    throw cause;
  }

  return (
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map(async (entry) => {
          try {
            return (
              await stat(join(candidate, entry.name, "story.json"))
            ).isFile();
          } catch {
            return false;
          }
        }),
    )
  ).some(Boolean);
}

export async function validateWorkspace(
  candidate: string,
  overrides: Partial<WorkspaceProbeOperations> = {},
): Promise<WorkspaceValidationResult> {
  const operations = { ...defaultProbeOperations, ...overrides };
  let info;
  try {
    info = await operations.stat(candidate);
  } catch (cause) {
    if (hasErrorCode(cause, "ENOENT")) {
      return validationError(
        "not-found",
        "This folder does not exist. Choose an existing folder or create it first.",
      );
    }
    throw cause;
  }
  if (!info.isDirectory()) {
    return validationError(
      "not-directory",
      "This location is a file, not a folder. Choose a folder for your stories.",
    );
  }

  const probeId = randomUUID();
  const source = join(candidate, `.earth-stories-write-${probeId}.tmp`);
  const promoted = join(candidate, `.earth-stories-rename-${probeId}.tmp`);
  const subdirectory = join(candidate, `.earth-stories-directory-${probeId}`);
  const lock = join(candidate, `.earth-stories-lock-${probeId}.tmp`);

  let handle;
  let lockHandle;
  try {
    try {
      handle = await operations.open(source, "wx", 0o600);
    } catch {
      return validationError(
        "create-file-failed",
        "Earth Stories could not create a test file in this folder. Choose a folder where you can add files.",
      );
    }
    try {
      await handle.writeFile("Earth Stories workspace probe\n", "utf8");
    } catch {
      return validationError(
        "write-file-failed",
        "Earth Stories could not write a test file in this folder. Choose another folder.",
      );
    }
    try {
      await handle.sync();
    } catch {
      return validationError(
        "sync-file-failed",
        "This folder could not finish a safe test write. Choose another folder for reliable saves.",
      );
    }
    await handle.close();
    handle = undefined;
    try {
      await operations.rename(source, promoted);
    } catch {
      return validationError(
        "rename-failed",
        "This folder cannot safely replace saved files. Choose another folder for reliable saves.",
      );
    }
    await operations.rm(promoted);

    try {
      await operations.mkdir(subdirectory);
    } catch {
      return validationError(
        "create-subdirectory-failed",
        "Earth Stories could not create a project folder here. Choose another folder.",
      );
    }
    try {
      await operations.rm(subdirectory, { recursive: true });
    } catch {
      return validationError(
        "remove-subdirectory-failed",
        "Earth Stories could not remove a test folder here. Choose another folder.",
      );
    }

    try {
      lockHandle = await operations.open(lock, "wx", 0o600);
    } catch {
      return validationError(
        "exclusive-create-failed",
        "This folder cannot create the lock files that protect stories from conflicting saves. Choose another folder.",
      );
    }
    await lockHandle.close();
    lockHandle = undefined;
    await operations.rm(lock);

    return { ok: true, findings: [] };
  } finally {
    await handle?.close().catch(() => undefined);
    await lockHandle?.close().catch(() => undefined);
    await Promise.all(
      [source, promoted, subdirectory, lock].map((path) =>
        rm(path, { recursive: true, force: true }).catch(() => undefined),
      ),
    );
  }
}

export async function readWorkspacePointer(
  pointerFile: string,
): Promise<string | null> {
  try {
    const value = JSON.parse(await readFile(pointerFile, "utf8")) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const workspace = (value as { workspace?: unknown }).workspace;
    return typeof workspace === "string" && workspace.length > 0
      ? workspace
      : null;
  } catch (cause) {
    if (
      cause instanceof SyntaxError ||
      (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
    ) {
      return null;
    }
    throw cause;
  }
}

export async function writeWorkspacePointer(
  pointerFile: string,
  workspace: string,
  operations: Pick<typeof import("node:fs/promises"), "rename"> = { rename },
): Promise<void> {
  const temporaryFile = join(
    dirname(pointerFile),
    `.workspace-${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporaryFile, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({ workspace })}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await operations.rename(temporaryFile, pointerFile);
  } catch (cause) {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryFile).catch(() => undefined);
    throw cause;
  }
}
