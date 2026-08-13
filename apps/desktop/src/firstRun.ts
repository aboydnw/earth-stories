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
  const stored = await readPointer(dependencies.pointerFile);
  if (stored) {
    const result = await validateWorkspace(stored);
    if (result.ok) return stored;
  }

  const choice = await dependencies.choose(dependencies.defaultPath);
  if (!choice) return null;
  const candidate =
    choice.kind === "default" ? dependencies.defaultPath : choice.path;
  let validation = await validateWorkspace(candidate);
  const willCreate = validation.findings.some(
    ({ code }) => code === "not-found",
  );
  const containsProjects = willCreate
    ? false
    : await looksLikeWorkspace(candidate);
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
    await mkdir(candidate, { recursive: true });
    validation = await validateWorkspace(candidate);
  }
  if (!validation.ok) {
    await dependencies.reportInvalid(validation);
    return null;
  }
  await writePointer(dependencies.pointerFile, candidate);
  return candidate;
}
