import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { runCommand, type CommandRunner } from "./command-runner.js";

export const GITHUB_SCOPES = "public_repo";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const DEFAULT_POLL_SECONDS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const GH_CLI_TIMEOUT_MS = 15_000;

export type TokenSource = "stored" | "gh" | "device";

export interface GitHubIdentity {
  token: string;
  login: string;
  source: TokenSource;
}

export interface DeviceCodePrompt {
  verificationUri: string;
  userCode: string;
  expiresInSeconds: number;
}

export interface ResolveTokenOptions {
  run?: CommandRunner;
  fetchImpl?: typeof fetch;
  credentialsPath?: string;
  clientId?: string;
  onDeviceCode?: (prompt: DeviceCodePrompt) => void;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Location of the stored token. Deliberately under the home directory rather
 * than a project folder: project folders are exported, zipped, and pushed to a
 * public repository, and a token must never be able to reach a release.
 */
export function credentialsPath(): string {
  return join(homedir(), ".earth-stories", "credentials.json");
}

interface StoredCredentials {
  token?: unknown;
  login?: unknown;
}

async function readStored(path: string): Promise<GitHubIdentity | null> {
  try {
    const parsed = JSON.parse(
      await readFile(path, "utf8"),
    ) as StoredCredentials;
    if (typeof parsed.token !== "string" || !parsed.token) return null;
    if (typeof parsed.login !== "string" || !parsed.login) return null;
    return { token: parsed.token, login: parsed.login, source: "stored" };
  } catch {
    return null;
  }
}

async function writeStored(
  path: string,
  identity: GitHubIdentity,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(
    path,
    `${JSON.stringify({ token: identity.token, login: identity.login }, null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(path, 0o600);
}

async function resolveLogin(
  token: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(USER_URL, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "earth-stories",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { login?: unknown };
    return typeof body.login === "string" && body.login ? body.login : null;
  } catch {
    return null;
  }
}

async function tokenFromGhCli(run: CommandRunner): Promise<string | null> {
  try {
    const { stdout } = await run({
      executable: "gh",
      args: ["auth", "token"],
      timeoutMs: GH_CLI_TIMEOUT_MS,
    });
    const token = stdout.trim();
    return token || null;
  } catch {
    return null;
  }
}

interface DeviceCodeResponse {
  device_code?: unknown;
  user_code?: unknown;
  verification_uri?: unknown;
  expires_in?: unknown;
  interval?: unknown;
}

interface AccessTokenResponse {
  access_token?: unknown;
  error?: unknown;
  interval?: unknown;
}

async function postJson<T>(
  url: string,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      "GitHub did not respond. Check your connection and try again.",
    );
  }
  if (!response.ok)
    throw new Error(
      `GitHub sign-in failed with ${response.status}. Check your connection and try again.`,
    );
  return (await response.json()) as T;
}

async function deviceFlow(
  options: Required<Pick<ResolveTokenOptions, "sleep">> & {
    fetchImpl: typeof fetch;
    clientId: string;
    onDeviceCode?: (prompt: DeviceCodePrompt) => void;
  },
): Promise<string> {
  const start = await postJson<DeviceCodeResponse>(
    DEVICE_CODE_URL,
    { client_id: options.clientId, scope: GITHUB_SCOPES },
    options.fetchImpl,
  );
  if (
    typeof start.device_code !== "string" ||
    typeof start.user_code !== "string" ||
    typeof start.verification_uri !== "string"
  )
    throw new Error("GitHub did not return a sign-in code. Try again.");

  const expiresInSeconds =
    typeof start.expires_in === "number" ? start.expires_in : 900;
  options.onDeviceCode?.({
    verificationUri: start.verification_uri,
    userCode: start.user_code,
    expiresInSeconds,
  });

  let intervalSeconds =
    typeof start.interval === "number" && start.interval > 0
      ? start.interval
      : DEFAULT_POLL_SECONDS;
  const attempts = Math.ceil(expiresInSeconds / intervalSeconds);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await options.sleep(intervalSeconds * 1000);
    const result = await postJson<AccessTokenResponse>(
      ACCESS_TOKEN_URL,
      {
        client_id: options.clientId,
        device_code: start.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
      options.fetchImpl,
    );
    if (typeof result.access_token === "string" && result.access_token)
      return result.access_token;
    if (result.error === "authorization_pending") continue;
    if (result.error === "slow_down") {
      intervalSeconds =
        typeof result.interval === "number" && result.interval > 0
          ? result.interval
          : intervalSeconds + 5;
      continue;
    }
    if (result.error === "access_denied")
      throw new Error("The GitHub sign-in request was declined.");
    if (result.error === "expired_token")
      throw new Error("The GitHub sign-in code expired. Start again.");
    throw new Error(
      `GitHub sign-in failed: ${typeof result.error === "string" ? result.error : "unknown error"}`,
    );
  }
  throw new Error("The GitHub sign-in code expired. Start again.");
}

/**
 * Resolves a usable GitHub token and account login, preferring credentials
 * this computer already has: a previously stored token, then the `gh` CLI,
 * and finally the device flow, which needs no git or CLI knowledge. Only the
 * device-flow token is written to disk; a `gh` token is read fresh each time
 * so signing out or rotating it there takes effect immediately.
 */
export async function resolveToken(
  options: ResolveTokenOptions = {},
): Promise<GitHubIdentity> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const run = options.run ?? runCommand;
  const path = options.credentialsPath ?? credentialsPath();
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((done) => setTimeout(done, ms)));

  const stored = await readStored(path);
  if (stored) {
    const login = await resolveLogin(stored.token, fetchImpl);
    if (login) return { token: stored.token, login, source: "stored" };
  }

  const ghToken = await tokenFromGhCli(run);
  if (ghToken) {
    const login = await resolveLogin(ghToken, fetchImpl);
    if (login) return { token: ghToken, login, source: "gh" };
  }

  const clientId =
    options.clientId ?? process.env.EARTH_STORIES_GITHUB_CLIENT_ID;
  if (!clientId)
    throw new Error(
      "Signing in to GitHub needs EARTH_STORIES_GITHUB_CLIENT_ID, or the GitHub CLI (`gh auth login`) on this computer.",
    );

  const token = await deviceFlow({
    fetchImpl,
    clientId,
    sleep,
    onDeviceCode: options.onDeviceCode,
  });
  const login = await resolveLogin(token, fetchImpl);
  if (!login)
    throw new Error("GitHub signed in but did not return an account name.");
  const identity: GitHubIdentity = { token, login, source: "device" };
  await writeStored(path, identity);
  return identity;
}
