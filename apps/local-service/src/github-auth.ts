import { runCommand, type CommandRunner } from "./command-runner.js";
import {
  FileCredentialStore,
  credentialsPath,
  type CredentialStore,
} from "./credentials.js";

export { credentialsPath } from "./credentials.js";

export const GITHUB_SCOPES = "public_repo";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const DEFAULT_POLL_SECONDS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const GH_CLI_TIMEOUT_MS = 15_000;
const STORED_TOKEN_UNAVAILABLE_MESSAGE =
  "GitHub could not verify the saved sign-in. Check your connection and try again.";

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
  store?: CredentialStore;
  clientId?: string;
  onDeviceCode?: (prompt: DeviceCodePrompt) => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
}

type LoginResolution =
  | { status: "valid"; login: string }
  | { status: "invalid" }
  | { status: "unavailable" };

async function resolveLogin(
  token: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<LoginResolution> {
  try {
    const response = await fetchImpl(USER_URL, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "earth-stories",
      },
      signal: requestSignal(signal),
    });
    if (response.status === 401) return { status: "invalid" };
    if (!response.ok) return { status: "unavailable" };
    const body = (await response.json()) as { login?: unknown };
    return typeof body.login === "string" && body.login
      ? { status: "valid", login: body.login }
      : { status: "unavailable" };
  } catch {
    throwIfAborted(signal);
    return { status: "unavailable" };
  }
}

function cancellationError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("GitHub sign-in was canceled.");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancellationError(signal);
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function waitWithSignal(
  waiting: Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  if (!signal) return waiting;
  await new Promise<void>((resolveWait, rejectWait) => {
    const onAbort = () => settle(() => rejectWait(cancellationError(signal)));
    const settle = (finish: () => void) => {
      signal.removeEventListener("abort", onAbort);
      finish();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    waiting.then(
      () => settle(resolveWait),
      (cause) => settle(() => rejectWait(cause)),
    );
  });
}

async function tokenFromGhCli(
  run: CommandRunner,
  signal?: AbortSignal,
): Promise<string | null> {
  throwIfAborted(signal);
  try {
    const { stdout } = await run({
      executable: "gh",
      args: ["auth", "token"],
      timeoutMs: GH_CLI_TIMEOUT_MS,
      signal,
    });
    const token = stdout.trim();
    return token || null;
  } catch {
    throwIfAborted(signal);
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
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: requestSignal(signal),
    });
  } catch {
    throwIfAborted(signal);
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
    signal?: AbortSignal;
  },
): Promise<string> {
  const start = await postJson<DeviceCodeResponse>(
    DEVICE_CODE_URL,
    { client_id: options.clientId, scope: GITHUB_SCOPES },
    options.fetchImpl,
    options.signal,
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
    await waitWithSignal(
      options.sleep(intervalSeconds * 1000, options.signal),
      options.signal,
    );
    const result = await postJson<AccessTokenResponse>(
      ACCESS_TOKEN_URL,
      {
        client_id: options.clientId,
        device_code: start.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
      options.fetchImpl,
      options.signal,
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
  const store =
    options.store ??
    new FileCredentialStore(options.credentialsPath ?? credentialsPath());
  const sleep =
    options.sleep ??
    ((ms: number, signal?: AbortSignal) =>
      new Promise<void>((resolveSleep, rejectSleep) => {
        if (signal?.aborted) {
          rejectSleep(cancellationError(signal));
          return;
        }
        let timer: NodeJS.Timeout;
        const onAbort = () =>
          settle(() => rejectSleep(cancellationError(signal!)));
        const settle = (finish: () => void) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          finish();
        };
        timer = setTimeout(() => settle(resolveSleep), ms);
        signal?.addEventListener("abort", onAbort, { once: true });
      }));
  throwIfAborted(options.signal);

  const stored = await store.read();
  if (stored) {
    const resolved = await resolveLogin(
      stored.token,
      fetchImpl,
      options.signal,
    );
    if (resolved.status === "valid")
      return {
        token: stored.token,
        login: resolved.login,
        source: "stored",
      };
    if (resolved.status === "unavailable")
      throw new Error(STORED_TOKEN_UNAVAILABLE_MESSAGE);
    await store.clear();
  }

  const ghToken = await tokenFromGhCli(run, options.signal);
  if (ghToken) {
    const resolved = await resolveLogin(ghToken, fetchImpl, options.signal);
    if (resolved.status === "valid")
      return { token: ghToken, login: resolved.login, source: "gh" };
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
    signal: options.signal,
  });
  const resolved = await resolveLogin(token, fetchImpl, options.signal);
  if (resolved.status !== "valid")
    throw new Error("GitHub signed in but did not return an account name.");
  const identity: GitHubIdentity = {
    token,
    login: resolved.login,
    source: "device",
  };
  await store.write({ token: identity.token, login: identity.login });
  return identity;
}
