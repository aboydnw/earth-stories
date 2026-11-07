import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import {
  parseStoredCredentials,
  type CredentialStore,
  type StoredCredentials,
} from "./credentials.js";
import type { GitHubIdentity } from "./github-auth.js";

export const GITHUB_CALLBACK_URI = "http://127.0.0.1:4318/github/callback";
const AUTH_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const API_ROOT = "https://api.github.com";
const REFRESH_MARGIN_MS = 60_000;
type VerifiedIdentity = GitHubIdentity & { accountId?: number };

function tokenMetadata(
  body: unknown,
  now: number,
  requireRefresh = false,
): {
  token: string;
  expiresAt?: number;
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
} {
  if (
    !isObject(body) ||
    typeof body.accessToken !== "string" ||
    !/^ghu_[A-Za-z0-9_]{1,500}$/.test(body.accessToken)
  )
    throw new Error("Invalid token response");
  const expires = (value: unknown): number => {
    if (
      !Number.isSafeInteger(value) ||
      (value as number) <= 0 ||
      !Number.isSafeInteger(now + (value as number) * 1000)
    )
      throw new Error("Invalid token lifetime");
    return now + (value as number) * 1000;
  };
  const expiresAt =
    body.expiresIn === undefined ? undefined : expires(body.expiresIn);
  const hasRefresh =
    body.refreshToken !== undefined || body.refreshTokenExpiresIn !== undefined;
  if (requireRefresh && !hasRefresh)
    throw new Error("Missing rotated credential");
  if (hasRefresh) {
    if (
      typeof body.refreshToken !== "string" ||
      !/^ghr_[A-Za-z0-9_]{1,500}$/.test(body.refreshToken) ||
      expiresAt === undefined
    )
      throw new Error("Invalid refresh credential");
    return {
      token: body.accessToken,
      expiresAt,
      refreshToken: body.refreshToken,
      refreshTokenExpiresAt: expires(body.refreshTokenExpiresIn),
    };
  }
  return {
    token: body.accessToken,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

export interface GitHubAppConfig {
  clientId: string;
  appSlug: string;
  brokerUrl: string;
}

// Public release settings, substituted by the service bundler. Never a secret.
declare const __EARTH_STORIES_GITHUB_APP_CONFIG__: GitHubAppConfig | null;
export function githubAppConfig(
  environment: NodeJS.ProcessEnv = process.env,
): GitHubAppConfig | null {
  const bundled =
    typeof __EARTH_STORIES_GITHUB_APP_CONFIG__ === "undefined"
      ? null
      : __EARTH_STORIES_GITHUB_APP_CONFIG__;
  const config = {
    clientId:
      environment.EARTH_STORIES_GITHUB_APP_CLIENT_ID ?? bundled?.clientId ?? "",
    appSlug:
      environment.EARTH_STORIES_GITHUB_APP_SLUG ?? bundled?.appSlug ?? "",
    brokerUrl:
      environment.EARTH_STORIES_GITHUB_BROKER_URL ?? bundled?.brokerUrl ?? "",
  };
  if (!config.clientId && !config.appSlug && !config.brokerUrl) return null;
  return validateGitHubAppConfig(config);
}

export function validateGitHubAppConfig(
  config: GitHubAppConfig,
): GitHubAppConfig {
  if (
    !/^[A-Za-z0-9_.-]{1,200}$/.test(config.clientId) ||
    !/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(config.appSlug)
  )
    throw new Error(
      "GitHub App connection settings are incomplete or invalid.",
    );
  let broker: URL;
  try {
    broker = new URL(config.brokerUrl);
  } catch {
    throw new Error("The GitHub token broker must have a public HTTPS URL.");
  }
  if (
    broker.protocol !== "https:" ||
    broker.username ||
    broker.password ||
    broker.search ||
    broker.hash ||
    broker.pathname !== "/api/github/exchange" ||
    broker.hostname === "localhost" ||
    !broker.hostname.includes(".") ||
    /^[\d.]+$/.test(broker.hostname) ||
    broker.hostname.includes(":")
  )
    throw new Error(
      "The GitHub token broker must use HTTPS and /api/github/exchange.",
    );
  return { ...config, brokerUrl: broker.href };
}

export interface GitHubConnectionSnapshot {
  configured: boolean;
  status: "disconnected" | "connecting" | "connected" | "failed";
  login: string | null;
  authorizationUrl: string | null;
  installationUrl: string | null;
  error: string | null;
}
export interface GitHubRepository {
  id: number;
  installationId: number;
  owner: string;
  name: string;
  fullName: string;
}
interface PendingConnection {
  generation: number;
  state: string;
  verifier: string;
  controller: AbortController;
  server: Server;
  timer?: NodeJS.Timeout;
  used: boolean;
}

function browserReply(
  response: ServerResponse,
  status: number,
  message: string,
): void {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  });
  response.end(message);
}
function equalState(left: string, right: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(left).digest(),
    createHash("sha256").update(right).digest(),
  );
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function segment(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_.-]{1,100}$/.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

async function boundedJson(
  response: Response,
  limit: number,
): Promise<unknown> {
  if (!response.body) throw new Error("Empty GitHub response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error("GitHub response is too large.");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Owns local credentials and the short-lived loopback callback, never browser tokens. */
export class GitHubAppConnection {
  readonly #config: GitHubAppConfig | null;
  readonly #store: CredentialStore;
  readonly #fetch: typeof fetch;
  readonly #callbackPort: number;
  readonly #authTimeoutMs: number;
  #pending: PendingConnection | null = null;
  #generation = 0;
  #identity: GitHubIdentity | null = null;
  #credential: StoredCredentials | null = null;
  #refreshing: {
    generation: number;
    controller: AbortController;
    promise: Promise<void>;
  } | null = null;
  #loaded = false;
  #loading: Promise<void> | null = null;
  #writeQueue: Promise<void> = Promise.resolve();
  #savedGeneration: number | null = null;
  readonly #authorizations = new Map<
    number,
    { generation: number; token: string; repository: GitHubRepository }
  >();
  #snapshot: GitHubConnectionSnapshot;

  constructor(
    store: CredentialStore,
    config: GitHubAppConfig | null,
    options: {
      fetchImpl?: typeof fetch;
      testOnlyCallbackPort?: number;
      testOnlyAuthTimeoutMs?: number;
    } = {},
  ) {
    this.#store = store;
    this.#config = config ? validateGitHubAppConfig(config) : null;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#callbackPort = options.testOnlyCallbackPort ?? 4318;
    this.#authTimeoutMs = options.testOnlyAuthTimeoutMs ?? AUTH_TTL_MS;
    this.#snapshot = {
      configured: Boolean(this.#config),
      status: "disconnected",
      login: null,
      authorizationUrl: null,
      installationUrl: this.#config
        ? `https://github.com/apps/${this.#config.appSlug}/installations/new`
        : null,
      error: null,
    };
  }

  async status(): Promise<GitHubConnectionSnapshot> {
    if (!this.#loaded && this.#config && !this.#pending) {
      this.#loading ??= this.#load().finally(() => {
        this.#loading = null;
      });
      await this.#loading;
    }
    if (this.#identity && this.#snapshot.status === "connected") {
      try {
        await this.#ensureFresh();
      } catch {
        /* Status exposes only the safe snapshot. */
      }
    }
    return { ...this.#snapshot };
  }

  async #load(): Promise<void> {
    const generation = this.#generation;
    const stored = parseStoredCredentials(await this.#store.read());
    if (generation !== this.#generation) return;
    this.#loaded = true;
    // Do not silently reuse a legacy broad OAuth or CLI credential.
    if (!stored?.token.startsWith("ghu_")) return;
    try {
      this.#credential = stored;
      await this.#ensureFresh();
      if (generation !== this.#generation) return;
      const current = this.#credential;
      if (!current) throw new Error("Missing credential");
      const identity = await this.#verify(current.token);
      if (
        current.accountId !== undefined &&
        (identity.accountId !== current.accountId ||
          identity.login !== current.login)
      )
        throw new Error("Account changed");
      if (generation !== this.#generation) return;
      this.#identity = identity;
      this.#snapshot = {
        ...this.#snapshot,
        status: "connected",
        login: identity.login,
        error: null,
      };
    } catch {
      if (generation !== this.#generation) return;
      // Refresh may already have recorded a more specific, sanitized cleanup failure.
      if (this.#snapshot.status === "failed") return;
      this.#snapshot = {
        ...this.#snapshot,
        status: "failed",
        error:
          "GitHub could not verify the saved connection. Reconnect, or try again after checking your network.",
      };
    }
  }

  async connect(): Promise<GitHubConnectionSnapshot> {
    if (!this.#config)
      throw new Error(
        "GitHub connection is not configured in this build. You can still build and download a ZIP.",
      );
    if (this.#pending) return this.status();
    const generation = ++this.#generation;
    this.#refreshing?.controller.abort();
    this.#refreshing = null;
    this.#credential = null;
    this.#authorizations.clear();
    this.#loaded = true;
    this.#identity = null;
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const server = createServer((request, response) => {
      const address = server.address();
      const port =
        address && typeof address !== "string"
          ? address.port
          : this.#callbackPort;
      if (
        request.headers.host !== `127.0.0.1:${port}` ||
        request.method !== "GET" ||
        !request.url?.startsWith("/github/callback?")
      ) {
        browserReply(response, 404, "Not found.");
        return;
      }
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      const pending = this.#pending;
      if (
        url.pathname !== "/github/callback" ||
        !pending ||
        pending.generation !== generation ||
        pending.used ||
        url.searchParams.getAll("state").length !== 1 ||
        !equalState(url.searchParams.get("state") ?? "", state)
      ) {
        browserReply(
          response,
          400,
          "This connection request is invalid or expired. Return to Earth Stories and try again.",
        );
        return;
      }
      if (url.searchParams.has("error")) {
        browserReply(
          response,
          400,
          "GitHub connection was declined. Return to Earth Stories.",
        );
        this.#fail(pending, "The GitHub connection request was declined.");
        return;
      }
      const code = url.searchParams.get("code");
      if (
        url.searchParams.getAll("code").length !== 1 ||
        !code ||
        !/^[A-Za-z0-9_.-]{1,512}$/.test(code)
      ) {
        browserReply(
          response,
          400,
          "GitHub did not return a valid connection code.",
        );
        return;
      }
      pending.used = true;
      browserReply(
        response,
        200,
        "Return to Earth Stories to finish connecting. You can close this tab.",
      );
      void this.#complete(pending, code);
    });
    const pending: PendingConnection = {
      generation,
      state,
      verifier,
      controller: new AbortController(),
      server,
      used: false,
    };
    this.#pending = pending;
    this.#snapshot = {
      ...this.#snapshot,
      status: "connecting",
      login: null,
      authorizationUrl: null,
      error: null,
    };
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.#callbackPort, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      if (generation !== this.#generation) {
        server.close();
        return { ...this.#snapshot };
      }
      const address = server.address();
      const callback =
        this.#callbackPort === 0 && address && typeof address !== "string"
          ? `http://127.0.0.1:${address.port}/github/callback`
          : GITHUB_CALLBACK_URI;
      const authorization = new URL("https://github.com/login/oauth/authorize");
      authorization.search = new URLSearchParams({
        client_id: this.#config.clientId,
        redirect_uri: callback,
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }).toString();
      this.#snapshot.authorizationUrl = authorization.href;
      pending.timer = setTimeout(
        () =>
          this.#fail(
            pending,
            "GitHub connection expired. Connect again to get a new link.",
          ),
        this.#authTimeoutMs,
      );
      pending.timer.unref();
    } catch {
      this.#fail(
        pending,
        "The GitHub callback port is unavailable. Close the other Earth Stories connection and try again.",
      );
    }
    return { ...this.#snapshot };
  }

  async #complete(pending: PendingConnection, code: string): Promise<void> {
    try {
      const response = await this.#fetch(this.#config!.brokerUrl, {
        method: "POST",
        redirect: "error",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ code, codeVerifier: pending.verifier }),
        signal: AbortSignal.any([
          pending.controller.signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("exchange failed");
      }
      const body = await boundedJson(response, 16 * 1024);
      const metadata = tokenMetadata(body, Date.now());
      const identity = await this.#verify(
        metadata.token,
        pending.controller.signal,
      );
      if (metadata.refreshToken && !identity.accountId)
        throw new Error("Missing account binding");
      const credential: StoredCredentials = {
        ...metadata,
        login: identity.login,
        ...(metadata.refreshToken
          ? {
              accountId: identity.accountId!,
              appClientId: this.#config!.clientId,
              brokerOrigin: new URL(this.#config!.brokerUrl).origin,
            }
          : {}),
      };
      await this.#serialize(async () => {
        if (this.#pending !== pending || pending.controller.signal.aborted)
          return;
        // A store can fail after atomically promoting a credential (for example
        // while securing its permissions). Cleanup must include attempted writes.
        this.#savedGeneration = pending.generation;
        await this.#store.write(credential);
        if (this.#pending !== pending || pending.controller.signal.aborted)
          return;
        this.#identity = identity;
        this.#credential = credential;
        this.#snapshot = {
          ...this.#snapshot,
          status: "connected",
          login: identity.login,
          authorizationUrl: null,
          error: null,
        };
        this.#closePending(pending);
      });
    } catch {
      this.#fail(
        pending,
        "GitHub connection could not be completed. Check your network and connect again.",
      );
    }
  }

  #serialize(operation: () => Promise<void>): Promise<void> {
    const result = this.#writeQueue.then(operation, operation);
    this.#writeQueue = result.catch(() => undefined);
    return result;
  }
  #closePending(pending: PendingConnection): void {
    clearTimeout(pending.timer);
    pending.controller.abort();
    pending.server.close();
    pending.server.closeAllConnections();
    if (this.#pending === pending) this.#pending = null;
  }
  #fail(pending: PendingConnection, message: string): void {
    if (this.#pending !== pending) return;
    ++this.#generation;
    this.#closePending(pending);
    void this.#serialize(async () => {
      if (this.#savedGeneration === pending.generation) {
        await this.#store.clear();
        this.#savedGeneration = null;
      }
    }).catch(() => {
      if (this.#snapshot.status === "failed")
        this.#snapshot.error =
          "Connection failed and its saved credential could not be removed. Disconnect GitHub before trying again.";
    });
    this.#snapshot = {
      ...this.#snapshot,
      status: "failed",
      authorizationUrl: null,
      error: message,
    };
  }
  async cancel(): Promise<GitHubConnectionSnapshot> {
    const pending = this.#pending;
    if (!pending) return { ...this.#snapshot };
    ++this.#generation;
    this.#closePending(pending);
    this.#snapshot = {
      ...this.#snapshot,
      status: "disconnected",
      login: null,
      authorizationUrl: null,
      error: null,
    };
    await this.#serialize(async () => {
      if (this.#savedGeneration === pending.generation) {
        await this.#store.clear();
        this.#savedGeneration = null;
      }
    });
    return { ...this.#snapshot };
  }
  async disconnect(): Promise<GitHubConnectionSnapshot> {
    ++this.#generation;
    this.#refreshing?.controller.abort();
    this.#refreshing = null;
    this.#credential = null;
    this.#authorizations.clear();
    if (this.#pending) this.#closePending(this.#pending);
    this.#loaded = true;
    this.#identity = null;
    this.#snapshot = {
      ...this.#snapshot,
      status: "disconnected",
      login: null,
      authorizationUrl: null,
      error: null,
    };
    await this.#serialize(async () => {
      await this.#store.clear();
      this.#savedGeneration = null;
    });
    return { ...this.#snapshot };
  }
  async close(): Promise<void> {
    await this.cancel();
    ++this.#generation;
    this.#refreshing?.controller.abort();
    this.#refreshing = null;
    this.#identity = null;
    this.#credential = null;
    this.#authorizations.clear();
    await this.#writeQueue;
  }

  async #ensureFresh(): Promise<void> {
    const credential = this.#credential;
    if (
      !credential ||
      credential.expiresAt === undefined ||
      credential.expiresAt > Date.now() + REFRESH_MARGIN_MS
    )
      return;
    if (this.#refreshing?.generation === this.#generation)
      return this.#refreshing.promise;
    const generation = this.#generation;
    const controller = new AbortController();
    const promise = this.#refresh(credential, generation, controller.signal);
    const operation = { generation, controller, promise };
    this.#refreshing = operation;
    try {
      await promise;
    } finally {
      if (this.#refreshing === operation) this.#refreshing = null;
    }
  }

  async #refresh(
    credential: StoredCredentials,
    generation: number,
    signal: AbortSignal,
  ): Promise<void> {
    const current = () =>
      generation === this.#generation &&
      this.#credential === credential &&
      !signal.aborted;
    try {
      if (
        !this.#config ||
        !credential.refreshToken ||
        !credential.refreshTokenExpiresAt ||
        credential.refreshTokenExpiresAt <= Date.now() ||
        credential.appClientId !== this.#config.clientId ||
        credential.brokerOrigin !== new URL(this.#config.brokerUrl).origin ||
        !credential.accountId
      )
        throw new Error("Reconnect required");
      // A rotation revokes the previous access token. Invalidate outstanding publication grants before sending it.
      this.#authorizations.clear();
      const response = await this.#fetch(
        new URL("/api/github/refresh", this.#config.brokerUrl).href,
        {
          method: "POST",
          redirect: "error",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ refreshToken: credential.refreshToken }),
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          ]),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Refresh failed");
      }
      const rotated = tokenMetadata(
        await boundedJson(response, 16 * 1024),
        Date.now(),
        true,
      );
      if (
        rotated.token === credential.token ||
        rotated.refreshToken === credential.refreshToken
      )
        throw new Error("Credentials did not rotate");
      if (!current()) throw new Error("Connection changed");
      const identity = await this.#verify(rotated.token, signal);
      if (
        identity.accountId !== credential.accountId ||
        identity.login !== credential.login
      )
        throw new Error("Account changed");
      await this.#serialize(async () => {
        if (!current()) return;
        const next = { ...credential, ...rotated };
        this.#savedGeneration = generation;
        await this.#store.write(next);
        if (!current()) return;
        this.#credential = next;
        this.#identity = identity;
      });
      if (generation !== this.#generation || signal.aborted)
        throw new Error("Connection changed");
    } catch {
      if (current()) {
        this.#identity = null;
        this.#credential = null;
        this.#snapshot = {
          ...this.#snapshot,
          status: "failed",
          login: null,
          error:
            "GitHub connection could not be refreshed. Connect GitHub again.",
        };
        this.#authorizations.clear();
        await this.#serialize(async () => {
          if (generation !== this.#generation) return;
          await this.#store.clear();
          this.#savedGeneration = null;
        }).catch(() => {
          if (generation === this.#generation) {
            this.#snapshot.error =
              "GitHub connection could not be refreshed, and its saved credential could not be removed. Credentials may remain on this device. Disconnect GitHub successfully before reconnecting or restarting Earth Stories.";
          }
        });
      }
      throw new Error(
        "GitHub connection could not be refreshed. Connect GitHub again.",
      );
    }
  }

  async #api(
    path: string,
    token: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(`${API_ROOT}${path}`, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "user-agent": "earth-stories",
          "x-github-api-version": "2022-11-28",
        },
        redirect: "error",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
          : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error(
        "GitHub could not be reached. Check your network and try again.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401)
        throw new Error(
          "The GitHub connection expired or was revoked. Connect GitHub again.",
        );
      throw new Error(
        `GitHub could not verify repository access (${response.status}). Try again or review the App installation.`,
      );
    }
    return boundedJson(response, 4 * 1024 * 1024);
  }
  async #verify(
    token: string,
    signal?: AbortSignal,
  ): Promise<VerifiedIdentity> {
    const body = await this.#api("/user", token, signal);
    if (!isObject(body) || !segment(body.login))
      throw new Error("GitHub did not return an account name.");
    return {
      token,
      login: body.login,
      source: "github-app",
      ...(safeId(body.id) ? { accountId: body.id } : {}),
    };
  }
  async #currentIdentity(signal?: AbortSignal): Promise<GitHubIdentity> {
    await this.status();
    if (!this.#identity || this.#snapshot.status !== "connected")
      throw new Error("Connect GitHub before publishing.");
    const generation = this.#generation;
    const identity = await this.#verify(this.#identity.token, signal);
    if (
      generation !== this.#generation ||
      !this.#identity ||
      Boolean(this.#refreshing) ||
      (this.#credential?.expiresAt !== undefined &&
        this.#credential.expiresAt <= Date.now()) ||
      this.#identity.login !== identity.login ||
      this.#identity.token !== identity.token ||
      (this.#credential?.accountId !== undefined &&
        this.#credential.accountId !== identity.accountId) ||
      signal?.aborted
    )
      throw new Error(
        "The GitHub connection changed. Review the account and try again.",
      );
    return identity;
  }

  async #repositories(
    identity: GitHubIdentity,
    signal?: AbortSignal,
  ): Promise<GitHubRepository[]> {
    const result: GitHubRepository[] = [];
    // Construct pagination paths locally; never send a bearer token to a Link URL.
    for (let page = 1; page <= 100; page++) {
      const body = await this.#api(
        `/user/installations?per_page=100&page=${page}`,
        identity.token,
        signal,
      );
      if (!isObject(body) || !Array.isArray(body.installations))
        throw new Error("GitHub returned an invalid installation list.");
      for (const installation of body.installations) {
        if (
          !isObject(installation) ||
          !safeId(installation.id) ||
          installation.app_slug !== this.#config?.appSlug ||
          installation.repository_selection !== "selected" ||
          installation.suspended_at ||
          !isObject(installation.permissions) ||
          installation.permissions.contents !== "write" ||
          installation.permissions.pages !== "write" ||
          installation.permissions.administration !== "write"
        )
          continue;
        for (let repositoryPage = 1; repositoryPage <= 100; repositoryPage++) {
          const repos = await this.#api(
            `/user/installations/${installation.id}/repositories?per_page=100&page=${repositoryPage}`,
            identity.token,
            signal,
          );
          if (!isObject(repos) || !Array.isArray(repos.repositories))
            throw new Error("GitHub returned an invalid repository list.");
          for (const repository of repos.repositories) {
            if (
              !isObject(repository) ||
              !safeId(repository.id) ||
              !isObject(repository.owner) ||
              !segment(repository.owner.login) ||
              !segment(repository.name) ||
              repository.private !== false ||
              repository.archived !== false ||
              repository.disabled === true ||
              !isObject(repository.permissions) ||
              repository.permissions.push !== true ||
              (repository.permissions.admin !== true &&
                repository.permissions.maintain !== true)
            )
              continue;
            result.push({
              id: repository.id,
              installationId: installation.id,
              owner: repository.owner.login,
              name: repository.name,
              fullName: `${repository.owner.login}/${repository.name}`,
            });
          }
          if (repos.repositories.length < 100) break;
          if (repositoryPage === 100)
            throw new Error(
              "Too many repositories to verify safely. Install the App on fewer repositories.",
            );
        }
      }
      if (body.installations.length < 100) break;
      if (page === 100)
        throw new Error("Too many GitHub installations to verify safely.");
    }
    return [
      ...new Map(
        result.map((repository) => [repository.id, repository]),
      ).values(),
    ].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }
  async repositories(signal?: AbortSignal): Promise<GitHubRepository[]> {
    const generation = this.#generation;
    const identity = await this.#currentIdentity(signal);
    const repositories = await this.#repositories(identity, signal);
    if (generation !== this.#generation || signal?.aborted)
      throw new Error("The GitHub connection changed. Refresh repositories.");
    return repositories;
  }
  async authorizeRepository(
    repositoryId: unknown,
    signal?: AbortSignal,
  ): Promise<{ identity: GitHubIdentity; repository: GitHubRepository }> {
    if (!safeId(repositoryId))
      throw new Error(
        "Choose an installed GitHub repository before publishing.",
      );
    const generation = this.#generation;
    const identity = await this.#currentIdentity(signal);
    const repository = (await this.#repositories(identity, signal)).find(
      (candidate) => candidate.id === repositoryId,
    );
    if (generation !== this.#generation || signal?.aborted)
      throw new Error(
        "The GitHub connection changed. Review the account and try again.",
      );
    if (!repository)
      throw new Error(
        "This repository is no longer available to the GitHub App. Review selected repositories and refresh.",
      );
    this.#authorizations.set(repository.id, {
      generation,
      token: identity.token,
      repository,
    });
    return { identity, repository };
  }

  assertAuthorizationCurrent(
    identity: GitHubIdentity,
    repository: GitHubRepository,
  ): void {
    const authorization = this.#authorizations.get(repository.id);
    if (
      this.#snapshot.status !== "connected" ||
      Boolean(this.#refreshing) ||
      (this.#credential?.expiresAt !== undefined &&
        this.#credential.expiresAt <= Date.now()) ||
      !this.#identity ||
      this.#identity.token !== identity.token ||
      this.#identity.login !== identity.login ||
      authorization?.generation !== this.#generation ||
      authorization.token !== identity.token ||
      authorization.repository.owner !== repository.owner ||
      authorization.repository.name !== repository.name ||
      authorization.repository.installationId !== repository.installationId
    )
      throw new Error(
        "The GitHub connection changed. Review the account and repository before publishing again.",
      );
  }
}
