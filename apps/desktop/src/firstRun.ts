import { mkdir } from "node:fs/promises";
import {
  looksLikeWorkspace,
  readWorkspacePointer,
  validateWorkspace,
  writeWorkspacePointer,
  type WorkspaceValidationResult,
} from "./workspace.js";

export type FirstRunChoice =
  { kind: "default" } | { kind: "existing" | "other"; path: string } | null;

export interface WorkspaceConfirmation {
  kind: Exclude<FirstRunChoice, null>["kind"];
  path: string;
  willCreate: boolean;
  containsProjects: boolean;
}

export interface FirstRunDependencies {
  pointerFile: string;
  defaultPath: string;
  readPointer?(pointerFile: string): Promise<string | null>;
  writePointer?(pointerFile: string, workspace: string): Promise<void>;
  choose(defaultPath: string): Promise<FirstRunChoice>;
  confirm(details: WorkspaceConfirmation): Promise<boolean>;
  reportInvalid(result: WorkspaceValidationResult): Promise<void> | void;
}

export async function resolveLaunchWorkspace(
  dependencies: FirstRunDependencies,
): Promise<string | null> {
  const readPointer = dependencies.readPointer ?? readWorkspacePointer;
  const writePointer = dependencies.writePointer ?? writeWorkspacePointer;
  const reportFilesystemFailure = async (message: string) => {
    await dependencies.reportInvalid({
      ok: false,
      findings: [{ code: "inspect-failed", severity: "error", message }],
    });
  };
  let stored: string | null;
  try {
    stored = await readPointer(dependencies.pointerFile);
  } catch {
    await reportFilesystemFailure(
      "Earth Stories could not read the saved workspace setting. Check that the application profile is available and try again.",
    );
    return null;
  }
  if (stored) {
    let result: WorkspaceValidationResult;
    try {
      result = await validateWorkspace(stored);
    } catch {
      await reportFilesystemFailure(
        "Earth Stories could not inspect the saved workspace. Check that the folder is available and try again.",
      );
      return null;
    }
    if (result.ok) return stored;
  }

  const choice = await dependencies.choose(dependencies.defaultPath);
  if (!choice) return null;
  const candidate =
    choice.kind === "default" ? dependencies.defaultPath : choice.path;
  let validation: WorkspaceValidationResult;
  try {
    validation = await validateWorkspace(candidate);
  } catch {
    await reportFilesystemFailure(
      "Earth Stories could not inspect this workspace folder. Check that it is available and try again.",
    );
    return null;
  }
  const willCreate = validation.findings.some(
    ({ code }) => code === "not-found",
  );
  let containsProjects = false;
  if (!willCreate)
    try {
      containsProjects = await looksLikeWorkspace(candidate);
    } catch {
      await reportFilesystemFailure(
        "Earth Stories could not inspect this workspace's projects. Check that the folder is available and try again.",
      );
      return null;
    }
  if (
    !(await dependencies.confirm({
      kind: choice.kind,
      path: candidate,
      willCreate,
      containsProjects,
    }))
  )
    return null;

  if (willCreate) {
    try {
      await mkdir(candidate, { recursive: true });
      validation = await validateWorkspace(candidate);
    } catch {
      await reportFilesystemFailure(
        "Earth Stories could not create or validate this workspace folder.",
      );
      return null;
    }
  }
  if (!validation.ok) {
    await dependencies.reportInvalid(validation);
    return null;
  }
  await writePointer(dependencies.pointerFile, candidate);
  return candidate;
}
