import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { afterEach, expect, it, vi } from "vitest";
import { ChatGPTConnection } from "./connection.js";
import type { StoredCredentials } from "../credentials.js";
const connections: ChatGPTConnection[] = [];
afterEach(async () => {
  await Promise.all(connections.splice(0).map((c) => c.close()));
});
async function setup(
  overrides: Record<string, unknown> = {},
  tokenOverrides: Record<string, unknown> = {},
) {
  const pair = await generateKeyPair("RS256");
  const keys = {
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "test", alg: "RS256" }],
  };
  let record: StoredCredentials | null = null;
  const store = {
    read: async () => record,
    write: async (v: StoredCredentials) => {
      record = v;
    },
    clear: async () => {
      record = null;
    },
  };
  let authorization: URL;
  let refreshes = 0;
  const fetcher = vi.fn(
    async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/oauth/token")) {
        const form = new URLSearchParams(init?.body as string);
        if (form.get("grant_type") === "refresh_token") refreshes++;
        const jwt = await new SignJWT({
          sub: "author",
          nonce: authorization.searchParams.get("nonce"),
          email: "person@example.org",
          ...overrides,
        })
          .setProtectedHeader({ alg: "RS256", kid: "test" })
          .setIssuer("https://auth.openai.com")
          .setAudience("oaiapp_test")
          .setIssuedAt()
          .setExpirationTime("1h")
          .sign(pair.privateKey);
        return Response.json({
          access_token: "secret-access-" + refreshes,
          refresh_token: "secret-refresh-" + refreshes,
          id_token: jwt,
          scope: "openid chatgpt.tokens.use.direct",
          token_type: "Bearer",
          expires_in: 3600,
          ...tokenOverrides,
        });
      }
      if (url.endsWith("/openid-configuration"))
        return Response.json({
          revocation_endpoint: "https://auth.openai.com/revoke",
        });
      return new Response(null, { status: 200 });
    },
  );
  const connection = new ChatGPTConnection(store, { fetcher, keys });
  connections.push(connection);
  await connection.initialize();
  const start = async (clientId?: string) => {
    const launch = await connection.start(clientId);
    const redirect = await fetch(launch.url, { redirect: "manual" });
    authorization = new URL(redirect.headers.get("location")!);
    return authorization;
  };
  const complete = async (auth: URL, changes: Record<string, string> = {}) => {
    const callback = new URL(auth.searchParams.get("redirect_uri")!);
    callback.search = new URLSearchParams({
      state: auth.searchParams.get("state")!,
      code: "code",
      client_id: "oaiapp_test",
      ...changes,
    }).toString();
    return fetch(callback);
  };
  return {
    connection,
    store,
    fetcher,
    start,
    complete,
    getRecord: () => record,
  };
}
it("registers with PKCE, keeps tokens out of public status, persists the host and reuses issued registrations", async () => {
  const s = await setup();
  const auth = await s.start();
  expect(auth.searchParams.get("client_id")).toBe("dynamic_agent_client");
  expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
  expect((await s.complete(auth)).status).toBe(200);
  expect(s.connection.status().configured).toBe(true);
  expect(JSON.stringify(s.connection.status())).not.toContain("secret-");
  expect((await s.connection.access()).token).toBe("secret-access-0");
  const next = await s.start("oaiapp_test");
  expect(next.searchParams.get("client_id")).toBe("oaiapp_test");
  expect(next.searchParams.get("ext_agent_host_id")).toBe(
    auth.searchParams.get("ext_agent_host_id"),
  );
  expect((await s.complete(next, { client_id: "swapped" })).status).toBe(400);
  expect(s.connection.status().configured).toBe(true);
});
it("rejects wrong state without exchanging a code and allows a correct callback", async () => {
  const s = await setup();
  const auth = await s.start();
  expect((await s.complete(auth, { state: "wrong" })).status).toBe(400);
  expect(s.fetcher).not.toHaveBeenCalled();
  expect((await s.complete(auth)).status).toBe(200);
  expect(s.fetcher).toHaveBeenCalledTimes(1);
});
it("rejects a signed token with the wrong nonce", async () => {
  const s = await setup({ nonce: "wrong" });
  const auth = await s.start();
  expect((await s.complete(auth)).status).toBe(400);
  expect(s.connection.status().configured).toBe(false);
  expect(s.connection.status().error).not.toContain("secret-");
});
it("revokes and clears credentials on sign out but retains registration identity", async () => {
  const s = await setup();
  await s.complete(await s.start());
  await s.connection.signOut();
  expect(s.connection.status().configured).toBe(false);
  expect(s.connection.status().accounts).toHaveLength(1);
  expect(s.getRecord()?.token).not.toContain("secret-");
  await expect(s.connection.access()).rejects.toThrow(/sign in/i);
});

it("does not enable plan usage from identity alone", async () => {
  const s = await setup({}, { scope: "openid email" });
  await s.complete(await s.start());
  expect(s.connection.status().configured).toBe(false);
  await expect(s.connection.access()).rejects.toThrow(/permission/);
});
it("serializes rotating-token refreshes and saves the replacement before returning", async () => {
  const s = await setup();
  await s.complete(await s.start());
  const saved = s.getRecord()!;
  const data = JSON.parse(saved.token);
  data.accounts[0].tokens.expiresAt = 0;
  await s.store.write({ ...saved, token: JSON.stringify(data) });
  await s.connection.initialize();
  const results = await Promise.all([
    s.connection.access(),
    s.connection.access(),
  ]);
  expect(results.map((r) => r.token)).toEqual([
    "secret-access-1",
    "secret-access-1",
  ]);
  expect(JSON.parse(s.getRecord()!.token).accounts[0].tokens.refresh).toBe(
    "secret-refresh-1",
  );
  expect(
    s.fetcher.mock.calls.filter(([, init]) =>
      String(init?.body).includes("grant_type=refresh_token"),
    ),
  ).toHaveLength(1);
});
it("does not activate credentials when durable storage fails", async () => {
  const s = await setup();
  const auth = await s.start();
  vi.spyOn(s.store, "write").mockRejectedValueOnce(
    new Error("disk unavailable"),
  );
  expect((await s.complete(auth)).status).toBe(400);
  expect(s.connection.status().configured).toBe(false);
});
it("exchanges a callback only once when it is replayed concurrently", async () => {
  const s = await setup();
  const auth = await s.start();
  const replies = await Promise.allSettled([
    s.complete(auth),
    s.complete(auth),
  ]);
  expect(
    replies.filter((r) => r.status === "fulfilled" && r.value.status === 200),
  ).toHaveLength(1);
  expect(
    s.fetcher.mock.calls.filter(([url]) =>
      String(url).endsWith("/oauth/token"),
    ),
  ).toHaveLength(1);
});
it("keeps the previous account when a returning registration changes subject", async () => {
  const claims: Record<string, unknown> = {};
  const s = await setup(claims);
  expect((await s.complete(await s.start())).status).toBe(200);
  claims.sub = "different-person";
  expect((await s.complete(await s.start("oaiapp_test"))).status).toBe(400);
  expect(JSON.parse(s.getRecord()!.token).accounts[0].subject).toBe("author");
  expect(s.connection.status().error).toContain("different account");
});
it("handles denied consent and closes a cancelled callback listener", async () => {
  const s = await setup();
  expect(
    (await s.complete(await s.start(), { error: "access_denied" })).status,
  ).toBe(400);
  expect(s.fetcher).not.toHaveBeenCalled();
  expect(s.connection.status().configured).toBe(false);
  const auth = await s.start();
  await s.connection.cancel();
  await expect(s.complete(auth)).rejects.toThrow();
  expect(s.connection.status().pending).toBe(false);
});
