import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand, type CommandRunner } from "./command-runner.js";

const API_ROOT = "https://api.github.com";
const COMMIT_AUTHOR_NAME = "Earth Stories";
const COMMIT_AUTHOR_EMAIL = "earth-stories@users.noreply.github.com";
export const DEFAULT_PAGES_BRANCH = "gh-pages";

export interface GitHubRequestOptions {
  token: string;
  fetchImpl?: typeof fetch;
}

function apiHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "user-agent": "earth-stories",
  };
}

/**
 * Turns a story title into a repository name GitHub accepts, which also
 * becomes the last segment of the published URL.
 */
export function slugRepoName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
  return slug || "earth-story";
}

export function pagesUrl(owner: string, repo: string): string {
  return `https://${owner.toLowerCase()}.github.io/${repo}/`;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === "string" ? body.message : "";
  } catch {
    return "";
  }
}

export interface EnsureRepositoryOptions extends GitHubRequestOptions {
  owner: string;
  repo: string;
  description?: string;
  expectExisting?: boolean;
}

/**
 * Makes sure a repository is available to publish into, creating it when it
 * does not exist. A repository that already holds something other than a
 * previous publication of this story is left alone: overwriting it would
 * force-push away work the author did not mean to replace.
 */
export async function ensureRepository(
  options: EnsureRepositoryOptions,
): Promise<{ created: boolean }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const existing = await fetchImpl(
    `${API_ROOT}/repos/${options.owner}/${options.repo}`,
    { headers: apiHeaders(options.token) },
  );

  if (existing.ok) {
    const body = (await existing.json()) as {
      owner?: { login?: unknown };
      size?: unknown;
    };
    const login = body.owner?.login;
    if (
      typeof login !== "string" ||
      login.toLowerCase() !== options.owner.toLowerCase()
    )
      throw new Error(
        `The repository ${options.owner}/${options.repo} belongs to someone else. Choose another name.`,
      );
    const empty = body.size === 0;
    if (!options.expectExisting && !empty)
      throw new Error(
        `You already have a repository named "${options.repo}" with files in it. Choose another name so nothing is overwritten.`,
      );
    return { created: false };
  }

  if (existing.status !== 404)
    throw new Error(
      `GitHub could not be reached (${existing.status}). ${await readError(existing)}`.trim(),
    );

  const created = await fetchImpl(`${API_ROOT}/user/repos`, {
    method: "POST",
    headers: apiHeaders(options.token),
    body: JSON.stringify({
      name: options.repo,
      description: options.description ?? "Published with Earth Stories",
      private: false,
      auto_init: false,
      has_issues: false,
      has_projects: false,
      has_wiki: false,
    }),
  });
  if (!created.ok)
    throw new Error(
      `The repository could not be created (${created.status}). ${await readError(created)}`.trim(),
    );
  return { created: true };
}

export interface PushReleaseOptions {
  directory: string;
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  message?: string;
  run?: CommandRunner;
}

/**
 * Force-pushes the built release as a single orphan commit. The release is
 * copied into a temporary directory first, so no git metadata is ever written
 * into the project folder and nothing outside `publication/` can be uploaded.
 */
export async function pushRelease(
  options: PushReleaseOptions,
): Promise<{ branch: string }> {
  const run = options.run ?? runCommand;
  const branch = options.branch ?? DEFAULT_PAGES_BRANCH;
  const remote = `https://x-access-token:${options.token}@github.com/${options.owner}/${options.repo}.git`;
  const secrets = [options.token, remote];
  const workspace = await mkdtemp(join(tmpdir(), "earth-stories-publish-"));

  try {
    await cp(options.directory, workspace, { recursive: true });
    await rm(join(workspace, ".git"), { recursive: true, force: true });
    await writeFile(join(workspace, ".nojekyll"), "");
    const git = (args: string[]) =>
      run({ executable: "git", args, cwd: workspace, secrets });

    await git(["init", "-b", branch]);
    await git(["add", "-A"]);
    await git([
      "-c",
      `user.name=${COMMIT_AUTHOR_NAME}`,
      "-c",
      `user.email=${COMMIT_AUTHOR_EMAIL}`,
      "commit",
      "-m",
      options.message ?? "Publish Earth Story",
    ]);
    await git(["push", "--force", remote, `${branch}:${branch}`]);
    return { branch };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export interface EnablePagesOptions extends GitHubRequestOptions {
  owner: string;
  repo: string;
  branch?: string;
}

/**
 * Points GitHub Pages at the pushed branch. Re-publishing hits an existing
 * Pages site, which the API reports as a conflict rather than success, so the
 * settings are updated instead.
 */
export async function enablePages(options: EnablePagesOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const branch = options.branch ?? DEFAULT_PAGES_BRANCH;
  const endpoint = `${API_ROOT}/repos/${options.owner}/${options.repo}/pages`;
  const source = { branch, path: "/" };

  const created = await fetchImpl(endpoint, {
    method: "POST",
    headers: apiHeaders(options.token),
    body: JSON.stringify({ source }),
  });
  if (created.ok || created.status === 201) return;
  if (created.status !== 409 && created.status !== 422)
    throw new Error(
      `GitHub Pages could not be enabled (${created.status}). ${await readError(created)}`.trim(),
    );

  const updated = await fetchImpl(endpoint, {
    method: "PUT",
    headers: apiHeaders(options.token),
    body: JSON.stringify({ source }),
  });
  if (!updated.ok && updated.status !== 204)
    throw new Error(
      `GitHub Pages could not be updated (${updated.status}). ${await readError(updated)}`.trim(),
    );
}

export interface WaitForPagesOptions {
  fetchImpl?: typeof fetch;
  deadlineMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onAttempt?: (attempt: number) => void;
}

/**
 * Polls the published URL until it serves the story. The first Pages build
 * routinely takes a minute or two, so this reports each attempt rather than
 * appearing to hang, and gives up with an honest message.
 */
export async function waitForPages(
  url: string,
  options: WaitForPagesOptions = {},
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const deadlineMs = options.deadlineMs ?? 300_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const started = now();

  for (let attempt = 1; ; attempt += 1) {
    options.onAttempt?.(attempt);
    let served = false;
    try {
      const response = await fetchImpl(url, { redirect: "follow" });
      await response.body?.cancel();
      served = response.ok;
    } catch {
      served = false;
    }
    if (served) return true;
    if (now() - started >= deadlineMs) return false;
    await sleep(intervalMs);
  }
}
