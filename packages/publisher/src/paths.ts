import { realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

function inside(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation !== ".." && !relation.startsWith(`..${sep}`);
}

export async function containedRealPath(
  projectDirectory: string,
  locator: string,
  escapeMessage: string,
): Promise<string> {
  const lexicalRoot = resolve(projectDirectory);
  const lexicalCandidate = resolve(lexicalRoot, locator);
  if (!inside(lexicalRoot, lexicalCandidate)) throw new Error(escapeMessage);

  const [root, candidate] = await Promise.all([
    realpath(lexicalRoot),
    realpath(lexicalCandidate),
  ]);
  if (!inside(root, candidate)) throw new Error(escapeMessage);
  return candidate;
}
