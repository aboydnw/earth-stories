import {
  blobSha,
  collectReleaseFiles,
  encodeBase64Stream,
  type ReleaseFile,
} from "./git-objects.js";

const API_ROOT = "https://api.github.com";
const COMMIT_AUTHOR_NAME = "Earth Stories";
const COMMIT_AUTHOR_EMAIL = "earth-stories@users.noreply.github.com";
const REPOSITORY_SEED_PATH = ".earth-stories-seed";
const REPOSITORY_SEED_CONTENT =
  "RWFydGggU3RvcmllcyBwdWJsaWNhdGlvbiByZXBvc2l0b3J5Cg==";
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

async function initializeEmptyRepository(
  options: EnsureRepositoryOptions,
  fetchImpl: typeof fetch,
): Promise<void> {
  const endpoint = `${API_ROOT}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/contents/${REPOSITORY_SEED_PATH}`;
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "PUT",
      headers: apiHeaders(options.token),
      body: JSON.stringify({
        message: "Initialize Earth Stories repository",
        content: REPOSITORY_SEED_CONTENT,
      }),
    });
  } catch (cause) {
    throw new Error(
      `The repository default branch could not be initialized: ${safeMessage(cause, options.token)}`,
    );
  }
  if (!response.ok) {
    const detail = safeMessage(await readError(response), options.token);
    if (response.status === 422) {
      try {
        const existing = await fetchImpl(endpoint, {
          headers: apiHeaders(options.token),
        });
        if (existing.ok) {
          await existing.body?.cancel();
          return;
        }
        await existing.body?.cancel();
      } catch {
        // Report the original initialization failure below.
      }
    }
    throw new Error(
      `The repository default branch could not be initialized (${response.status}).${detail ? ` ${detail}` : ""}`,
    );
  }
  await response.body?.cancel();
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
    if (empty) await initializeEmptyRepository(options, fetchImpl);
    return { created: false };
  }

  if (existing.status !== 404) {
    const detail = safeMessage(await readError(existing), options.token);
    throw new Error(
      `GitHub could not be reached (${existing.status}). ${detail}`.trim(),
    );
  }
  await existing.body?.cancel();

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
  if (!created.ok) {
    const detail = safeMessage(await readError(created), options.token);
    throw new Error(
      `The repository could not be created (${created.status}). ${detail}`.trim(),
    );
  }
  await created.body?.cancel();
  await initializeEmptyRepository(options, fetchImpl);
  return { created: true };
}

export interface PushReleaseOptions {
  directory: string;
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  message?: string;
  fetchImpl?: typeof fetch;
  onProgress?: (progress: PushReleaseProgress) => void;
}

export interface PushReleaseProgress {
  uploaded: number;
  skipped: number;
}

interface GitHubObjectRequest {
  fetchImpl: typeof fetch;
  token: string;
  url: string;
  operation: string;
  init?: Omit<RequestInit, "body">;
  body?: () => BodyInit;
}

interface HashedReleaseFile extends ReleaseFile {
  sha: string;
}

const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 60_000;

function safeMessage(value: unknown, token: string): string {
  const message = value instanceof Error ? value.message : String(value);
  return token ? message.split(token).join("[REDACTED]") : message;
}

function retryDelay(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (header === null) return response.status === 429 ? 1_000 : null;
  const seconds = Number(header);
  if (Number.isFinite(seconds))
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, seconds * 1_000));
  const date = Date.parse(header);
  return Number.isNaN(date)
    ? 1_000
    : Math.min(MAX_RETRY_DELAY_MS, Math.max(0, date - Date.now()));
}

function waitForRetry(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (!signal)
    return new Promise((done) => {
      setTimeout(done, ms);
    });
  if (signal.aborted)
    return Promise.reject(
      signal.reason instanceof Error ? signal.reason : new Error("Aborted"),
    );

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(
        signal.reason instanceof Error ? signal.reason : new Error("Aborted"),
      );
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function githubObjectRequest({
  fetchImpl,
  token,
  url,
  operation,
  init,
  body,
}: GitHubObjectRequest): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      const requestInit: RequestInit & { duplex?: "half" } = {
        ...init,
        headers: apiHeaders(token),
        body: body?.(),
      };
      if (body) requestInit.duplex = "half";
      response = await fetchImpl(url, requestInit);
    } catch (cause) {
      throw new Error(`${operation} failed: ${safeMessage(cause, token)}`);
    }

    const delay = retryDelay(response);
    const rateLimited =
      (response.status === 403 || response.status === 429) && delay !== null;
    if (rateLimited && attempt < MAX_RATE_LIMIT_RETRIES) {
      await response.body?.cancel();
      await waitForRetry(delay, init?.signal);
      continue;
    }
    if (rateLimited) {
      await response.body?.cancel();
      throw new Error(
        `${operation} failed because GitHub's rate limit remained active after ${attempt + 1} attempts.`,
      );
    }
    return response;
  }
}

function jsonBody(value: unknown): () => BodyInit {
  return () => JSON.stringify(value);
}

function base64BlobBody(path: string): BodyInit {
  const encoder = new TextEncoder();
  const chunks = (async function* () {
    yield encoder.encode('{"content":"');
    for await (const chunk of encodeBase64Stream(path))
      yield encoder.encode(chunk);
    yield encoder.encode('\",\"encoding\":\"base64\"}');
  })();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}

async function responseJson<T>(
  response: Response,
  operation: string,
  token: string,
): Promise<T> {
  if (!response.ok) {
    const detail = safeMessage(await readError(response), token);
    throw new Error(
      `${operation} failed (${response.status}).${detail ? ` ${detail}` : ""}`,
    );
  }
  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new Error(
      `${operation} returned an invalid response: ${safeMessage(cause, token)}`,
    );
  }
}

async function readExistingBlobs(
  options: PushReleaseOptions,
  branch: string,
): Promise<Set<string>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const root = `${API_ROOT}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git`;
  const ref = await githubObjectRequest({
    fetchImpl,
    token: options.token,
    url: `${root}/ref/heads/${encodeURIComponent(branch)}`,
    operation: "Reading the publication branch",
  });
  if (ref.status === 404) {
    await ref.body?.cancel();
    return new Set();
  }
  const refBody = await responseJson<{ object?: { sha?: unknown } }>(
    ref,
    "Reading the publication branch",
    options.token,
  );
  if (typeof refBody.object?.sha !== "string")
    throw new Error("Reading the publication branch returned no commit SHA.");

  const commit = await githubObjectRequest({
    fetchImpl,
    token: options.token,
    url: `${root}/commits/${encodeURIComponent(refBody.object.sha)}`,
    operation: "Reading the previous publication commit",
  });
  const commitBody = await responseJson<{ tree?: { sha?: unknown } }>(
    commit,
    "Reading the previous publication commit",
    options.token,
  );
  if (typeof commitBody.tree?.sha !== "string")
    throw new Error(
      "Reading the previous publication commit returned no tree SHA.",
    );

  const tree = await githubObjectRequest({
    fetchImpl,
    token: options.token,
    url: `${root}/trees/${encodeURIComponent(commitBody.tree.sha)}?recursive=1`,
    operation: "Reading the previous publication tree",
  });
  const treeBody = await responseJson<{
    truncated?: unknown;
    tree?: Array<{ type?: unknown; sha?: unknown }>;
  }>(tree, "Reading the previous publication tree", options.token);
  if (treeBody.truncated === true) return new Set();
  return new Set(
    (treeBody.tree ?? [])
      .filter(
        (entry): entry is { type: "blob"; sha: string } =>
          entry.type === "blob" && typeof entry.sha === "string",
      )
      .map(({ sha }) => sha),
  );
}

async function uploadMissingBlobs(
  options: PushReleaseOptions,
  files: HashedReleaseFile[],
  existing: Set<string>,
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `${API_ROOT}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/blobs`;
  const missing = files.filter(({ sha }) => !existing.has(sha));
  const skipped = files.length - missing.length;
  let uploaded = 0;
  let next = 0;
  let failed = false;
  let failure: unknown;
  const uploads = new AbortController();
  options.onProgress?.({ uploaded, skipped });

  async function worker(): Promise<void> {
    while (!uploads.signal.aborted) {
      const index = next++;
      const file = missing[index];
      if (!file) return;
      if (uploads.signal.aborted) return;
      try {
        const response = await githubObjectRequest({
          fetchImpl,
          token: options.token,
          url: endpoint,
          operation: `Uploading ${file.path}`,
          init: { method: "POST", signal: uploads.signal },
          body: () => base64BlobBody(file.absolute),
        });
        if (uploads.signal.aborted) return;
        const result = await responseJson<{ sha?: unknown }>(
          response,
          `Uploading ${file.path}`,
          options.token,
        );
        if (uploads.signal.aborted) return;
        if (result.sha !== file.sha)
          throw new Error(
            `Uploading ${file.path} returned a blob SHA that did not match the local file.`,
          );
        uploaded += 1;
        options.onProgress?.({ uploaded, skipped });
      } catch (cause) {
        if (!failed) {
          failed = true;
          failure = cause;
          uploads.abort(cause);
        }
        return;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(4, missing.length) }, () => worker()),
  );
  if (failed) throw failure;
}

async function createTree(
  options: PushReleaseOptions,
  files: HashedReleaseFile[],
): Promise<string> {
  const response = await githubObjectRequest({
    fetchImpl: options.fetchImpl ?? fetch,
    token: options.token,
    url: `${API_ROOT}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/trees`,
    operation: "Creating the publication tree",
    init: { method: "POST" },
    body: jsonBody({
      tree: [
        ...files.map(({ path, sha }) => ({
          path,
          mode: "100644",
          type: "blob",
          sha,
        })),
        { path: ".nojekyll", mode: "100644", type: "blob", content: "" },
      ],
    }),
  });
  const result = await responseJson<{ sha?: unknown }>(
    response,
    "Creating the publication tree",
    options.token,
  );
  if (typeof result.sha !== "string")
    throw new Error("Creating the publication tree returned no SHA.");
  return result.sha;
}

async function createCommit(
  options: PushReleaseOptions,
  tree: string,
): Promise<string> {
  const response = await githubObjectRequest({
    fetchImpl: options.fetchImpl ?? fetch,
    token: options.token,
    url: `${API_ROOT}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/commits`,
    operation: "Creating the publication commit",
    init: { method: "POST" },
    body: jsonBody({
      message: options.message ?? "Publish Earth Story",
      tree,
      author: { name: COMMIT_AUTHOR_NAME, email: COMMIT_AUTHOR_EMAIL },
    }),
  });
  const result = await responseJson<{ sha?: unknown }>(
    response,
    "Creating the publication commit",
    options.token,
  );
  if (typeof result.sha !== "string")
    throw new Error("Creating the publication commit returned no SHA.");
  return result.sha;
}

async function forceUpdateRef(
  options: PushReleaseOptions,
  branch: string,
  commit: string,
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const root = `${API_ROOT}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git`;
  const updated = await githubObjectRequest({
    fetchImpl,
    token: options.token,
    url: `${root}/refs/heads/${encodeURIComponent(branch)}`,
    operation: "Updating the publication branch",
    init: { method: "PATCH" },
    body: jsonBody({ sha: commit, force: true }),
  });
  if (updated.ok) {
    await updated.body?.cancel();
    return;
  }
  if (updated.status === 404) await updated.body?.cancel();
  else
    await responseJson(
      updated,
      "Updating the publication branch",
      options.token,
    );

  const created = await githubObjectRequest({
    fetchImpl,
    token: options.token,
    url: `${root}/refs`,
    operation: "Creating the publication branch",
    init: { method: "POST" },
    body: jsonBody({ ref: `refs/heads/${branch}`, sha: commit }),
  });
  if (created.ok) await created.body?.cancel();
  else
    await responseJson(
      created,
      "Creating the publication branch",
      options.token,
    );
}

/**
 * Uploads the built release as Git objects and force-replaces the Pages branch
 * with one orphan commit. File contents are streamed and unchanged blobs from
 * the previous publication are reused.
 */
export async function pushRelease(
  options: PushReleaseOptions,
): Promise<{ branch: string }> {
  try {
    const branch = options.branch ?? DEFAULT_PAGES_BRANCH;
    const files: HashedReleaseFile[] = [];
    for (const file of (await collectReleaseFiles(options.directory)).filter(
      ({ path }) => path !== ".nojekyll",
    ))
      files.push({ ...file, sha: await blobSha(file.absolute) });
    const existing = await readExistingBlobs(options, branch);
    await uploadMissingBlobs(options, files, existing);
    const tree = await createTree(options, files);
    const commit = await createCommit(options, tree);
    await forceUpdateRef(options, branch, commit);
    return { branch };
  } catch (cause) {
    throw new Error(safeMessage(cause, options.token));
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
  if (created.ok || created.status === 201) {
    await created.body?.cancel();
    return;
  }
  if (created.status !== 409 && created.status !== 422)
    throw new Error(
      `GitHub Pages could not be enabled (${created.status}). ${await readError(created)}`.trim(),
    );
  await created.body?.cancel();

  const updated = await fetchImpl(endpoint, {
    method: "PUT",
    headers: apiHeaders(options.token),
    body: JSON.stringify({ source }),
  });
  if (!updated.ok && updated.status !== 204)
    throw new Error(
      `GitHub Pages could not be updated (${updated.status}). ${await readError(updated)}`.trim(),
    );
  await updated.body?.cancel();
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
    const remaining = deadlineMs - (now() - started);
    if (remaining <= 0) return false;
    options.onAttempt?.(attempt);

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), remaining);
    abortTimer.unref?.();
    let served = false;
    try {
      const response = await fetchImpl(url, {
        redirect: "follow",
        signal: controller.signal,
      });
      await response.body?.cancel();
      served = response.ok;
    } catch {
      served = false;
    } finally {
      clearTimeout(abortTimer);
    }
    if (served) return true;
    if (now() - started >= deadlineMs) return false;
    await sleep(intervalMs);
  }
}
