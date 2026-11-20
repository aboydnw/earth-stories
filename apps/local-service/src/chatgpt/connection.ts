import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { z } from "zod";
import { errors as joseErrors, type JSONWebKeySet } from "jose";
import { acquireChatGPTLease } from "./lease.js";
class RejectedGrant extends Error {}
import type { CredentialStore } from "../credentials.js";
import type { ChatGPTStatus } from "@earth-stories/story-schema";
import { verifyIdentity, issuer } from "./identity.js";
const resource = "https://api.openai.com/v1";
const directScope = "chatgpt.tokens.use.direct";
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  id_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive().max(86400),
  scope: z.string(),
});
const accountSchema = z.object({
  clientId: z.string().min(1),
  subject: z.string().min(1),
  label: z.string(),
  pendingRefresh: z
    .object({ response: tokenSchema, receivedAt: z.number() })
    .optional(),
  tokens: z
    .object({
      access: z.string(),
      refresh: z.string(),
      identity: z.string(),
      expiresAt: z.number(),
      scopes: z.array(z.string()),
    })
    .nullable(),
});
const stateSchema = z.object({
  version: z.literal(1),
  hostId: z.string().uuid(),
  active: z.string().nullable(),
  accounts: z.array(accountSchema).max(20),
});
type State = z.infer<typeof stateSchema>;
type Pending = {
  server: Server;
  timer: ReturnType<typeof setTimeout>;
  state: string;
  nonce: string;
  verifier: string;
  redirect: string;
  clientId: string | null;
  launch: string;
  authorization: string;
  used: boolean;
};
export class ChatGPTConnection {
  private data: State = {
    version: 1,
    hostId: randomUUID(),
    active: null,
    accounts: [],
  };
  private pending: Pending | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private error: string | null = null;
  private closed = false;
  private initialized = false;
  private releaseLease: (() => Promise<void>) | null = null;
  private readonly fetcher: typeof fetch;
  constructor(
    private readonly store: CredentialStore,
    private readonly options: {
      fetcher?: typeof fetch;
      keys?: JSONWebKeySet;
      lockPath?: string;
    } = {},
  ) {
    this.fetcher = options.fetcher ?? fetch;
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => {}).then(action);
    this.queue = next;
    return next;
  }
  async initialize() {
    return this.serial(async () => {
      try {
        await this.ensureInitialized();
      } catch (cause) {
        this.error =
          cause instanceof Error
            ? cause.message
            : "ChatGPT connection is unavailable.";
      }
    });
  }
  private async ensureInitialized() {
    if (this.closed) throw new Error("The local service is stopping.");
    if (this.initialized) return;
    try {
      if (this.options.lockPath)
        this.releaseLease = await acquireChatGPTLease(this.options.lockPath);
      const saved = await this.store.read();
      if (saved) {
        try {
          this.data = stateSchema.parse(JSON.parse(saved.token));
        } catch {
          throw new Error(
            "Saved ChatGPT connection is unreadable. Restore or remove its dedicated credential file.",
          );
        }
      }
      this.initialized = true;
      this.error = null;
    } catch (cause) {
      await this.releaseLease?.();
      this.releaseLease = null;
      throw cause;
    }
  }
  private save() {
    return this.store.write({
      login: "ChatGPT",
      token: JSON.stringify(this.data),
    });
  }
  status(): ChatGPTStatus {
    const account = this.data.accounts.find(
      (a) => a.clientId === this.data.active,
    );
    return {
      configured: Boolean(account?.tokens?.scopes.includes(directScope)),
      pending: Boolean(this.pending),
      activeAccount: account?.clientId ?? null,
      accounts: this.data.accounts.map((a) => ({
        id: a.clientId,
        label: a.label,
        connected: Boolean(a.tokens),
        planEnabled: Boolean(a.tokens?.scopes.includes(directScope)),
      })),
      error: this.error,
    };
  }
  private stopPending() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    p.server.close();
    p.server.closeAllConnections();
  }
  async cancel() {
    return this.serial(async () => {
      this.stopPending();
      this.error = null;
    });
  }
  async start(clientId?: string): Promise<{ url: string }> {
    return this.serial(async () => {
      await this.ensureInitialized();
      this.stopPending();
      this.error = null;
      const account = clientId
        ? this.data.accounts.find((a) => a.clientId === clientId)
        : undefined;
      if (clientId && !account)
        throw new Error("Choose a saved ChatGPT account.");
      if (!account && this.data.accounts.length >= 20)
        throw new Error("The saved account limit has been reached.");
      await this.save(); // Persist the host before its first registration.
      const state = randomBytes(32).toString("base64url"),
        nonce = randomBytes(32).toString("base64url"),
        verifier = randomBytes(48).toString("base64url"),
        launch = randomBytes(32).toString("base64url");
      const server = createServer((req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; frame-ancestors 'none'",
        );
        const p = this.pending;
        if (!p || p.server !== server) {
          res.writeHead(410);
          res.end("Sign-in expired. Return to Earth Stories.");
          return;
        }
        let url: URL;
        try {
          url = new URL(req.url ?? "/", p.redirect);
        } catch {
          res.writeHead(400);
          res.end("Invalid sign-in request.");
          return;
        }
        if (
          req.method !== "GET" ||
          req.headers.host !== new URL(p.redirect).host
        ) {
          res.writeHead(400);
          res.end("Invalid sign-in request.");
          return;
        }
        if (
          url.pathname === "/launch" &&
          url.searchParams.get("ticket") === p.launch
        ) {
          res.writeHead(302, { Location: p.authorization });
          res.end();
          return;
        }
        if (
          url.pathname !== "/auth/callback" ||
          url.searchParams.getAll("code").length > 1 ||
          url.searchParams.getAll("client_id").length > 1 ||
          url.searchParams.getAll("state").length !== 1 ||
          url.searchParams.get("state") !== p.state ||
          p.used
        ) {
          res.writeHead(400);
          res.end("Invalid sign-in callback.");
          return;
        }
        p.used = true;
        void this.serial(async () => {
          const previous = structuredClone(this.data);
          try {
            if (this.pending !== p || this.closed)
              throw new Error("Sign-in expired.");
            if (url.searchParams.has("error"))
              throw new Error(
                "ChatGPT sign-in was declined. You can try again.",
              );
            const returned = url.searchParams.get("client_id");
            const issued = p.clientId ?? returned;
            if (
              !issued ||
              issued === "dynamic_agent_client" ||
              !/^oaiapp_[A-Za-z0-9_-]+$/.test(issued) ||
              (p.clientId && returned && returned !== p.clientId)
            )
              throw new Error(
                "ChatGPT registration did not match this sign-in.",
              );
            const code = url.searchParams.get("code");
            if (!code || code.length > 8192)
              throw new Error("ChatGPT sign-in did not return a valid code.");
            const tokens = await this.exchange({
              grant_type: "authorization_code",
              client_id: issued,
              code,
              code_verifier: p.verifier,
              redirect_uri: p.redirect,
              resource,
            });
            const identity = await verifyIdentity(
              tokens.id_token,
              issued,
              p.nonce,
              this.options.keys,
            );
            const old = this.data.accounts.find((a) => a.clientId === issued);
            if (old && old.subject !== identity.sub)
              throw new Error("ChatGPT returned a different account.");
            if (this.pending !== p || this.closed)
              throw new Error("Sign-in expired.");
            const updated = {
              clientId: issued,
              subject: identity.sub!,
              label:
                typeof identity.email === "string"
                  ? identity.email
                  : "ChatGPT account",
              tokens: this.credentials(tokens),
            };
            this.data.accounts = this.data.accounts
              .filter((a) => a.clientId !== issued)
              .concat(updated);
            this.data.active = issued;
            await this.save();
            this.error = updated.tokens.scopes.includes(directScope)
              ? null
              : "Signed in, but ChatGPT plan use was not enabled. Continue with ChatGPT to grant access.";
            res.writeHead(200);
            res.end(
              "You can return to Earth Stories. This window can be closed.",
            );
          } catch (cause) {
            this.data = previous;
            this.error =
              cause instanceof Error &&
              /^ChatGPT|^Sign-in|^Signed in/.test(cause.message)
                ? cause.message
                : "ChatGPT identity could not be verified. Please sign in again.";
            res.writeHead(400);
            res.end(
              "Sign-in could not finish. Return to Earth Stories and try again.",
            );
          } finally {
            if (this.pending === p) {
              clearTimeout(p.timer);
              this.pending = null;
              server.close();
            }
          }
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("ChatGPT callback could not start.");
      const redirect = `http://127.0.0.1:${address.port}/auth/callback`;
      const authorization = new URL(`${issuer}/api/accounts/authorize`);
      const params: Record<string, string> = {
        client_id: account?.clientId ?? "dynamic_agent_client",
        ext_agent_host_id: `urn:uuid:${this.data.hostId}`,
        response_type: "code",
        redirect_uri: redirect,
        scope:
          "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
        resource,
        state,
        nonce,
        code_challenge_method: "S256",
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
      };
      if (!account) params.agent_name_hint = "Earth Stories";
      else if (account.tokens?.identity)
        params.id_token_hint = account.tokens.identity;
      for (const [key, value] of Object.entries(params))
        authorization.searchParams.set(key, value);
      const timer = setTimeout(
        () => {
          if (this.pending?.server === server) {
            this.stopPending();
            this.error = "ChatGPT sign-in expired. Please try again.";
          }
        },
        10 * 60 * 1000,
      );
      timer.unref();
      this.pending = {
        server,
        timer,
        state,
        nonce,
        verifier,
        redirect,
        clientId: account?.clientId ?? null,
        launch,
        authorization: authorization.href,
        used: false,
      };
      return {
        url: `http://127.0.0.1:${address.port}/launch?ticket=${launch}`,
      };
    });
  }
  private async exchange(form: Record<string, string>) {
    let response: Response;
    try {
      response = await this.fetcher(`${issuer}/api/accounts/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error("ChatGPT could not be reached. Please try again.");
    }
    if (!response.ok) {
      let code: unknown;
      try {
        code = JSON.parse(await boundedText(response, 65536)).error;
      } catch {
        /* Never expose response bodies. */
      }
      if (code === "invalid_grant" || response.status === 401)
        throw new RejectedGrant(
          "ChatGPT sign-in needs to be renewed. Please reconnect.",
        );
      throw new Error("ChatGPT could not renew the connection. Please retry.");
    }
    const text = await boundedText(response, 256 * 1024);
    try {
      return tokenSchema.parse(JSON.parse(text));
    } catch {
      throw new Error("ChatGPT returned an invalid sign-in response.");
    }
  }
  private credentials(tokens: z.infer<typeof tokenSchema>) {
    return {
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      identity: tokens.id_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      scopes: tokens.scope.split(/\s+/),
    };
  }
  async access(): Promise<{ token: string; accountId: string }> {
    return this.serial(async () => {
      await this.ensureInitialized();
      const account = this.data.accounts.find(
        (a) => a.clientId === this.data.active,
      );
      if (!account?.tokens) throw new Error("Please sign in with ChatGPT.");
      if (!account.tokens.scopes.includes(directScope))
        throw new Error(
          "ChatGPT plan use is not enabled. Reconnect to grant permission.",
        );
      for (
        let attempt = 0;
        attempt < 2 &&
        (account.pendingRefresh ||
          account.tokens.expiresAt <= Date.now() + (attempt === 0 ? 60000 : 0));
        attempt++
      ) {
        try {
          if (!account.pendingRefresh) {
            const response = await this.exchange({
              grant_type: "refresh_token",
              client_id: account.clientId,
              refresh_token: account.tokens.refresh,
              resource,
            });
            account.pendingRefresh = { response, receivedAt: Date.now() };
          }
          // Save rotated credentials before fetching verification keys. They remain
          // quarantined: never use them for inference before verifying identity.
          await this.save();
          const tokens = account.pendingRefresh.response;
          const identity = await verifyIdentity(
            tokens.id_token,
            account.clientId,
            null,
            this.options.keys,
          );
          if (identity.sub !== account.subject)
            throw new RejectedGrant("Account changed.");
          const previous = account.tokens;
          const pending = account.pendingRefresh;
          account.tokens = {
            ...this.credentials(tokens),
            expiresAt: pending.receivedAt + tokens.expires_in * 1000,
          };
          delete account.pendingRefresh;
          try {
            await this.save();
          } catch (cause) {
            account.tokens = previous;
            account.pendingRefresh = pending;
            throw cause;
          }
          this.error = null;
        } catch (cause) {
          const rejected =
            cause instanceof RejectedGrant ||
            cause instanceof joseErrors.JWTClaimValidationFailed ||
            cause instanceof joseErrors.JWTExpired ||
            cause instanceof joseErrors.JWSSignatureVerificationFailed ||
            cause instanceof joseErrors.JWSInvalid ||
            cause instanceof joseErrors.JWTInvalid;
          if (rejected) {
            account.tokens = null;
            delete account.pendingRefresh;
            await this.save();
          }
          this.error = rejected
            ? "ChatGPT sign-in needs to be renewed. Please reconnect."
            : "ChatGPT could not renew the connection temporarily. Your sign-in is saved; please retry.";
          throw new Error(this.error);
        }
      }
      if (!account.tokens.scopes.includes(directScope))
        throw new Error(
          "ChatGPT plan use is not enabled. Reconnect to grant permission.",
        );
      if (account.tokens.expiresAt <= Date.now())
        throw new Error(
          "ChatGPT renewal took too long. Please retry; your sign-in is retained.",
        );
      return { token: account.tokens.access, accountId: account.clientId };
    });
  }
  async signOut() {
    return this.serial(async () => {
      await this.ensureInitialized();
      this.stopPending();
      const account = this.data.accounts.find(
        (a) => a.clientId === this.data.active,
      );
      this.error = null;
      if (account?.tokens) {
        try {
          const discovery = await this.fetcher(
            `${issuer}/.well-known/openid-configuration`,
            { redirect: "error", signal: AbortSignal.timeout(10000) },
          );
          if (!discovery.ok) throw new Error();
          const config = JSON.parse(await boundedText(discovery, 65536));
          const endpoint = new URL(config.revocation_endpoint);
          if (
            endpoint.origin !== issuer ||
            endpoint.username ||
            endpoint.password
          )
            throw new Error();
          const response = await this.fetcher(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              token:
                account.pendingRefresh?.response.refresh_token ??
                account.tokens.refresh,
              token_type_hint: "refresh_token",
              client_id: account.clientId,
            }).toString(),
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          });
          await response.body?.cancel();
          if (response.status !== 200) throw new Error();
        } catch {
          this.error =
            "Signed out locally. Remote disconnection was not confirmed; disconnect Earth Stories in ChatGPT settings.";
        }
        account.tokens = null;
        delete account.pendingRefresh;
      }
      this.data.active = null;
      await this.save();
    });
  }
  async close() {
    this.closed = true;
    this.stopPending();
    await this.queue.catch(() => {});
    await this.releaseLease?.();
    this.releaseLease = null;
  }
}
export async function boundedText(
  response: Response,
  limit: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ChatGPT returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit)
        throw new Error("ChatGPT response exceeded its size limit.");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel();
  }
}
