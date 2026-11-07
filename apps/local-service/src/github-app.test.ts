import { createHash } from "node:crypto";
import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CredentialStore, StoredCredentials } from "./credentials.js";
import {
  GITHUB_CALLBACK_URI,
  GitHubAppConnection,
  githubAppConfig,
  validateGitHubAppConfig,
} from "./github-app.js";

const config = {
  clientId: "Iv1.public-client",
  appSlug: "earth-stories-test",
  brokerUrl: "https://broker.example.com/api/github/exchange",
};

function rotatingCredential(): StoredCredentials {
  return {
    token: "ghu_old",
    login: "mapper",
    expiresAt: Date.now() - 1000,
    refreshToken: "ghr_old",
    refreshTokenExpiresAt: Date.now() + 86_400_000,
    accountId: 123,
    appClientId: config.clientId,
    brokerOrigin: new URL(config.brokerUrl).origin,
  };
}
function refreshFetch(
  response: unknown = {
    accessToken: "ghu_rotated",
    expiresIn: 28800,
    refreshToken: "ghr_rotated",
    refreshTokenExpiresIn: 86400,
  },
) {
  const fallback = fakeFetch();
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith("/api/github/refresh")) return json(response);
    if (String(input) === "https://api.github.com/user")
      return json({ login: "mapper", id: 123 });
    return fallback(input, init);
  });
}

describe("GitHub App secure rotation", () => {
  it("persists complete exchange metadata only after account verification", async () => {
    const base = refreshFetch();
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) =>
        String(input) === config.brokerUrl
          ? json({
              accessToken: "ghu_first",
              expiresIn: 28800,
              refreshToken: "ghr_first",
              refreshTokenExpiresIn: 86400,
            })
          : base(input, init),
    );
    const { connection, store } = setup({ fetchImpl });
    const { callback } = await begin(connection);
    await fetch(callback);
    await connected(connection);
    expect(await store.read()).toMatchObject({
      token: "ghu_first",
      refreshToken: "ghr_first",
      accountId: 123,
      appClientId: config.clientId,
      brokerOrigin: "https://broker.example.com",
      expiresAt: expect.any(Number),
      refreshTokenExpiresAt: expect.any(Number),
    });
  });

  it("rejects incomplete exchange refresh metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        accessToken: "ghu_first",
        expiresIn: 28800,
        refreshToken: "ghr_first",
      }),
    );
    const { connection, store } = setup({ fetchImpl });
    const { callback } = await begin(connection);
    await fetch(callback);
    await vi.waitFor(async () =>
      expect((await connection.status()).status).toBe("failed"),
    );
    expect(store.write).not.toHaveBeenCalled();
  });

  it("refreshes one time for concurrent use and persists a verified rotated pair", async () => {
    const fetchImpl = refreshFetch();
    const { connection, store } = setup({
      initial: rotatingCredential(),
      fetchImpl,
    });
    const statuses = await Promise.all([
      connection.status(),
      connection.status(),
      connection.status(),
    ]);
    expect(statuses.every((status) => status.status === "connected")).toBe(
      true,
    );
    const refreshes = fetchImpl.mock.calls.filter(([url]) =>
      String(url).endsWith("/refresh"),
    );
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0][1]).toMatchObject({
      method: "POST",
      redirect: "error",
      body: JSON.stringify({ refreshToken: "ghr_old" }),
    });
    expect(await store.read()).toMatchObject({
      token: "ghu_rotated",
      refreshToken: "ghr_rotated",
      accountId: 123,
      expiresAt: expect.any(Number),
      refreshTokenExpiresAt: expect.any(Number),
    });
    expect(JSON.stringify(statuses)).not.toMatch(
      /ghu_|ghr_|refreshToken|expiresAt|accountId/,
    );
    await expect(connection.repositories()).resolves.toHaveLength(1);
  });

  it.each([
    { accessToken: "ghu_rotated", expiresIn: 28800 },
    {
      accessToken: "ghu_rotated",
      expiresIn: -1,
      refreshToken: "ghr_new",
      refreshTokenExpiresIn: 86400,
    },
    { accessToken: "ghu_rotated", expiresIn: 28800, refreshToken: "ghr_new" },
    {
      accessToken: "ghu_rotated",
      expiresIn: 28800,
      refreshToken: "bad",
      refreshTokenExpiresIn: 86400,
    },
    {
      accessToken: "ghu_old",
      expiresIn: 28800,
      refreshToken: "ghr_new",
      refreshTokenExpiresIn: 86400,
    },
    {
      accessToken: "ghu_new",
      expiresIn: 28800,
      refreshToken: "ghr_old",
      refreshTokenExpiresIn: 86400,
    },
  ])(
    "rejects malformed/non-rotating response without saving it %#",
    async (body) => {
      const { connection, store } = setup({
        initial: rotatingCredential(),
        fetchImpl: refreshFetch(body),
      });
      expect((await connection.status()).status).toBe("failed");
      expect(store.write).not.toHaveBeenCalled();
      expect(await store.read()).toBeNull();
      await expect(connection.repositories()).rejects.toThrow(/Connect GitHub/);
    },
  );

  it.each(["expired", "wrong-client", "wrong-host"])(
    "rejects %s refresh context before transmitting token",
    async (mode) => {
      const initial = rotatingCredential();
      if (mode === "expired") initial.refreshTokenExpiresAt = Date.now() - 1;
      if (mode === "wrong-client") initial.appClientId = "Iv1.other";
      if (mode === "wrong-host")
        initial.brokerOrigin = "https://other.example.com";
      const fetchImpl = refreshFetch();
      const { connection, store } = setup({ initial, fetchImpl });
      expect((await connection.status()).status).toBe("failed");
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await store.read()).toBeNull();
    },
  );

  it("rejects a refreshed credential belonging to another account", async () => {
    const base = refreshFetch();
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) =>
        String(input).endsWith("/user")
          ? json({ login: "mapper", id: 999 })
          : base(input, init),
    );
    const { connection, store } = setup({
      initial: rotatingCredential(),
      fetchImpl,
    });
    expect((await connection.status()).status).toBe("failed");
    expect(store.write).not.toHaveBeenCalled();
    expect(await store.read()).toBeNull();
  });

  it("fails closed after network/ambiguous refresh failure without leaking exception data", async () => {
    const { connection, store } = setup({
      initial: rotatingCredential(),
      fetchImpl: vi.fn(async () => {
        throw new Error("ghr_secret upstream debug");
      }),
    });
    const status = await connection.status();
    expect(status.status).toBe("failed");
    expect(JSON.stringify(status)).not.toMatch(/ghr_|debug/);
    expect(await store.read()).toBeNull();
  });

  it("does not restore a credential after disconnect during a late refresh", async () => {
    let release!: (value: Response) => void;
    const response = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(async () => response);
    const { connection, store } = setup({
      initial: rotatingCredential(),
      fetchImpl,
    });
    const pending = connection.status();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await connection.disconnect();
    release(
      json({
        accessToken: "ghu_late",
        expiresIn: 28800,
        refreshToken: "ghr_late",
        refreshTokenExpiresIn: 86400,
      }),
    );
    await pending;
    expect((await connection.status()).status).toBe("disconnected");
    expect(store.write).not.toHaveBeenCalled();
    expect(await store.read()).toBeNull();
  });

  it("does not overwrite a newly connected account with a stale refresh", async () => {
    let release!: (value: Response) => void;
    const late = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const base = refreshFetch();
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) =>
        String(input).endsWith("/refresh") ? late : base(input, init),
    );
    const { connection, store } = setup({
      initial: rotatingCredential(),
      fetchImpl,
    });
    const pending = connection.status();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const { callback } = await begin(connection);
    await fetch(callback);
    await connected(connection);
    release(
      json({
        accessToken: "ghu_late",
        expiresIn: 28800,
        refreshToken: "ghr_late",
        refreshTokenExpiresIn: 86400,
      }),
    );
    await pending;
    expect(await store.read()).toMatchObject({
      token: "ghu_new",
      login: "mapper",
    });
    expect((await connection.status()).status).toBe("connected");
  });

  it("clears a possibly promoted rotation after persistence fails", async () => {
    const { connection, store } = setup({
      initial: rotatingCredential(),
      fetchImpl: refreshFetch(),
    });
    store.write.mockRejectedValueOnce(
      new Error("ghr_private filesystem error"),
    );
    expect((await connection.status()).status).toBe("failed");
    expect(await store.read()).toBeNull();
    expect(store.clear).toHaveBeenCalled();
  });

  it("reports retained credentials if promotion succeeds but write and cleanup fail", async () => {
    const { connection, store } = setup({
      initial: rotatingCredential(),
      fetchImpl: refreshFetch(),
    });
    const promote = store.write.getMockImplementation()!;
    store.write.mockImplementationOnce(async (next) => {
      await promote(next);
      throw new Error("ghr_private failure after promotion");
    });
    store.clear.mockRejectedValueOnce(new Error("ghu_private cleanup failure"));
    const snapshot = await connection.status();
    expect(snapshot.status).toBe("failed");
    expect(snapshot.error).toContain("saved credential could not be removed");
    expect(snapshot.error).toContain("Credentials may remain on this device");
    expect(snapshot.error).toContain("Disconnect GitHub successfully");
    expect(JSON.stringify(snapshot)).not.toMatch(
      /ghr_|ghu_|after promotion|cleanup failure/,
    );
    expect(await store.read()).toMatchObject({
      token: "ghu_rotated",
      refreshToken: "ghr_rotated",
    });
    await expect(connection.repositories()).rejects.toThrow(/Connect GitHub/);
    await connection.disconnect();
    expect(await store.read()).toBeNull();
    expect((await connection.status()).status).toBe("disconnected");
  });

  it("invalidates previously authorized publications before starting refresh", async () => {
    const initial = rotatingCredential();
    initial.expiresAt = Date.now() + 120_000;
    const fetchImpl = refreshFetch();
    const { connection } = setup({ initial, fetchImpl });
    const authorization = await connection.authorizeRepository(42);
    connection.assertAuthorizationCurrent(
      authorization.identity,
      authorization.repository,
    );
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValue(initial.expiresAt - 30_000);
    try {
      await connection.status();
    } finally {
      now.mockRestore();
    }
    expect(() =>
      connection.assertAuthorizationCurrent(
        authorization.identity,
        authorization.repository,
      ),
    ).toThrow(/connection changed/);
  });
});
const connections: GitHubAppConnection[] = [];
afterEach(async () => {
  await Promise.all(
    connections.splice(0).map((connection) => connection.close()),
  );
});
function memoryStore(initial: StoredCredentials | null = null) {
  let value = initial;
  return {
    read: vi.fn(async () => value),
    write: vi.fn(async (next: StoredCredentials) => {
      value = next;
    }),
    clear: vi.fn(async () => {
      value = null;
    }),
  } satisfies CredentialStore;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const repository = {
  id: 42,
  name: "coastline",
  owner: { login: "maps-org" },
  private: false,
  archived: false,
  permissions: { push: true, admin: true },
};
const installation = {
  id: 7,
  app_slug: config.appSlug,
  suspended_at: null,
  repository_selection: "selected",
  permissions: { contents: "write", pages: "write", administration: "write" },
};
function fakeFetch() {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url === config.brokerUrl)
      return json({
        accessToken: "ghu_new",
        expiresIn: 28800,
      });
    if (url === "https://api.github.com/user") return json({ login: "mapper" });
    if (url.includes("/user/installations?"))
      return json({ installations: [installation] });
    if (url.includes("/user/installations/7/repositories?"))
      return json({ repositories: [repository] });
    throw new Error(`Unexpected URL ${url}`);
  });
}
function setup(
  options: {
    initial?: StoredCredentials | null;
    fetchImpl?: typeof fetch;
    configured?: boolean;
  } = {},
) {
  const store = memoryStore(options.initial ?? null);
  const fetchImpl = options.fetchImpl ?? fakeFetch();
  const connection = new GitHubAppConnection(
    store,
    options.configured === false ? null : config,
    { fetchImpl, testOnlyCallbackPort: 0 },
  );
  connections.push(connection);
  return { store, fetchImpl, connection };
}
async function begin(connection: GitHubAppConnection) {
  const snapshot = await connection.connect();
  const auth = new URL(snapshot.authorizationUrl!);
  return {
    auth,
    callback: `${auth.searchParams.get("redirect_uri")}?state=${auth.searchParams.get("state")}&code=auth-code`,
  };
}
async function connected(connection: GitHubAppConnection) {
  await vi.waitFor(async () =>
    expect((await connection.status()).status).toBe("connected"),
  );
}

describe("GitHub App public configuration", () => {
  it("has one fixed production callback and no secret setting", () => {
    expect(GITHUB_CALLBACK_URI).toBe("http://127.0.0.1:4318/github/callback");
    expect(githubAppConfig({})).toBeNull();
    expect(
      githubAppConfig({
        EARTH_STORIES_GITHUB_APP_CLIENT_ID: config.clientId,
        EARTH_STORIES_GITHUB_APP_SLUG: config.appSlug,
        EARTH_STORIES_GITHUB_BROKER_URL: config.brokerUrl,
      }),
    ).toEqual(config);
  });
  it.each([
    "http://broker.example.com/api/github/exchange",
    "https://user:secret@broker.example.com/api/github/exchange",
    "https://broker.example.com/other",
    "https://broker.example.com/api/github/exchange?target=evil",
    "https://127.0.0.1/api/github/exchange",
    "https://localhost/api/github/exchange",
  ])("rejects unsafe broker configuration %s", (brokerUrl) => {
    expect(() => validateGitHubAppConfig({ ...config, brokerUrl })).toThrow();
  });
  it("does not enable a partial configuration", () =>
    expect(() =>
      githubAppConfig({ EARTH_STORIES_GITHUB_APP_CLIENT_ID: "client" }),
    ).toThrow());
});

describe("GitHub App local connection", () => {
  it("is unavailable without maintainer configuration", async () => {
    const { connection, fetchImpl } = setup({ configured: false });
    expect(await connection.status()).toMatchObject({
      configured: false,
      status: "disconnected",
    });
    await expect(connection.connect()).rejects.toThrow(/not configured/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("does not silently reuse a legacy OAuth token", async () => {
    const { connection, fetchImpl, store } = setup({
      initial: { token: "ghp_old", login: "other" },
    });
    expect(await connection.status()).toMatchObject({
      status: "disconnected",
      login: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
  });
  it("verifies a stored App token without returning it to the browser", async () => {
    const { connection } = setup({
      initial: { token: "ghu_stored", login: "stale" },
    });
    const snapshot = await connection.status();
    expect(snapshot).toMatchObject({ status: "connected", login: "mapper" });
    expect(JSON.stringify(snapshot)).not.toContain("ghu_");
  });
  it("keeps transient failures visible without erasing the saved token", async () => {
    const { connection, store } = setup({
      initial: { token: "ghu_stored", login: "mapper" },
      fetchImpl: vi.fn(async () => json({}, 503)),
    });
    expect(await connection.status()).toMatchObject({
      status: "failed",
      login: null,
    });
    expect(store.clear).not.toHaveBeenCalled();
  });
  it("uses S256 and persists only verified user token and login", async () => {
    const { connection, fetchImpl, store } = setup();
    const { auth, callback } = await begin(connection);
    expect(auth.origin).toBe("https://github.com");
    expect(auth.searchParams.get("scope")).toBeNull();
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    expect((await fetch(callback)).status).toBe(200);
    await connected(connection);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe(config.brokerUrl);
    const exchange = JSON.parse(String(init!.body));
    expect(
      createHash("sha256").update(exchange.codeVerifier).digest("base64url"),
    ).toBe(auth.searchParams.get("code_challenge"));
    expect(exchange.code).toBe("auth-code");
    expect(init).toMatchObject({ redirect: "error", method: "POST" });
    expect(store.write).toHaveBeenCalledExactlyOnceWith({
      token: "ghu_new",
      login: "mapper",
      expiresAt: expect.any(Number),
    });
    expect(JSON.stringify(await connection.status())).not.toMatch(
      /ghu_|refreshToken|codeVerifier|code_challenge/,
    );
  });
  it("coalesces repeated Connect clicks and does not rotate the pending state", async () => {
    const { connection } = setup();
    const [first, second] = await Promise.all([
      connection.connect(),
      connection.connect(),
    ]);
    expect(second.status).toBe("connecting");
    expect((await connection.status()).authorizationUrl).toBe(
      first.authorizationUrl,
    );
  });
  it("rejects wrong and duplicate states without consuming the valid request", async () => {
    const { connection, fetchImpl } = setup();
    const { callback } = await begin(connection);
    expect(
      (await fetch(callback.replace(/state=[^&]+/, "state=wrong"))).status,
    ).toBe(400);
    expect((await fetch(`${callback}&state=second`)).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await fetch(callback)).status).toBe(200);
    await connected(connection);
  });
  it("rejects unrelated paths, methods and Host headers", async () => {
    const { connection, fetchImpl } = setup();
    const { callback } = await begin(connection);
    expect((await fetch(callback, { method: "POST" })).status).toBe(404);
    expect(
      (await fetch(callback.replace("/github/callback", "/other"))).status,
    ).toBe(404);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        callback,
        { headers: { host: "attacker.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("rejects duplicate authorization codes", async () => {
    const { connection, fetchImpl } = setup();
    const { callback } = await begin(connection);
    expect((await fetch(`${callback}&code=another`)).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("reports a declined authorization without reflecting upstream details", async () => {
    const { connection, fetchImpl } = setup();
    const { callback } = await begin(connection);
    const response = await fetch(
      `${callback}&error=access_denied&error_description=secret`,
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("secret");
    expect(await connection.status()).toMatchObject({
      status: "failed",
      error: expect.stringContaining("declined"),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("closes the callback on cancellation and permits a fresh attempt", async () => {
    const { connection, store } = setup();
    const first = await begin(connection);
    expect(await connection.cancel()).toMatchObject({
      status: "disconnected",
      authorizationUrl: null,
    });
    await expect(fetch(first.callback)).rejects.toThrow();
    const second = await begin(connection);
    expect(second.auth.searchParams.get("state")).not.toBe(
      first.auth.searchParams.get("state"),
    );
    expect(store.write).not.toHaveBeenCalled();
  });
  it("does not persist credentials from an exchange completing after cancel", async () => {
    let finish!: (value: Response) => void;
    const fetchImpl = vi.fn((input: string | URL | Request) =>
      String(input) === config.brokerUrl
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(json({ login: "mapper" })),
    );
    const { connection, store } = setup({ fetchImpl });
    const { callback } = await begin(connection);
    await fetch(callback);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await connection.cancel();
    finish(json({ accessToken: "ghu_late" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.write).not.toHaveBeenCalled();
    expect(await connection.status()).toMatchObject({ status: "disconnected" });
  });
  it("clears only local credentials on disconnect", async () => {
    const { connection, store, fetchImpl } = setup({
      initial: { token: "ghu_stored", login: "mapper" },
    });
    await connection.status();
    await connection.disconnect();
    expect(await connection.status()).toMatchObject({
      status: "disconnected",
      login: null,
    });
    expect(store.clear).toHaveBeenCalledOnce();
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(1);
  });
  it("does not reflect secrets in broker failures", async () => {
    const { connection, store } = setup({
      fetchImpl: vi.fn(async () => {
        throw new Error("client-secret-ghu_sensitive");
      }),
    });
    const { callback } = await begin(connection);
    await fetch(callback);
    await vi.waitFor(async () =>
      expect((await connection.status()).status).toBe("failed"),
    );
    expect(JSON.stringify(await connection.status())).not.toMatch(
      /client-secret|ghu_sensitive/,
    );
    expect(store.write).not.toHaveBeenCalled();
  });
});

describe("GitHub App selected repositories", () => {
  it("lists writable public repositories only from this App", async () => {
    const fetchImpl = fakeFetch();
    fetchImpl.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/user")) return json({ login: "mapper" });
      if (url.includes("/user/installations?"))
        return json({
          installations: [
            installation,
            { ...installation, id: 8, app_slug: "other-app" },
            { ...installation, id: 9, suspended_at: "today" },
            {
              ...installation,
              id: 10,
              permissions: { contents: "read", pages: "write" },
            },
          ],
        });
      return json({
        repositories: [
          repository,
          { ...repository, id: 43, private: true },
          { ...repository, id: 44, archived: true },
          { ...repository, id: 45, permissions: { push: false } },
          { ...repository, id: 46, disabled: true },
        ],
      });
    });
    const { connection } = setup({
      initial: { token: "ghu_stored", login: "mapper" },
      fetchImpl,
    });
    expect(await connection.repositories()).toEqual([
      {
        id: 42,
        installationId: 7,
        owner: "maps-org",
        name: "coastline",
        fullName: "maps-org/coastline",
      },
    ]);
    expect(
      fetchImpl.mock.calls
        .map(([url]) => String(url))
        .filter((url) => /installations\/[89]|installations\/10/.test(url)),
    ).toHaveLength(0);
  });
  it("requires a positive numeric installed repository ID", async () => {
    const { connection } = setup({
      initial: { token: "ghu_stored", login: "mapper" },
    });
    for (const id of [undefined, "42", -1, 0, 1.5, Infinity])
      await expect(connection.authorizeRepository(id)).rejects.toThrow(
        /Choose/,
      );
    await expect(connection.authorizeRepository(99)).rejects.toThrow(
      /no longer available/,
    );
    expect(await connection.authorizeRepository(42)).toMatchObject({
      identity: { login: "mapper", source: "github-app" },
      repository: { owner: "maps-org", name: "coastline" },
    });
  });
  it("revalidates access rather than trusting a prior picker list", async () => {
    const fetchImpl = fakeFetch();
    const { connection } = setup({
      initial: { token: "ghu_stored", login: "mapper" },
      fetchImpl,
    });
    await connection.repositories();
    fetchImpl.mockImplementation(async (input) =>
      String(input).endsWith("/user")
        ? json({ login: "mapper" })
        : json({ installations: [] }),
    );
    await expect(connection.authorizeRepository(42)).rejects.toThrow(
      /no longer available/,
    );
  });
  it("does not leak an API error body or bearer token", async () => {
    const fetchImpl = fakeFetch();
    const { connection } = setup({
      initial: { token: "ghu_stored", login: "mapper" },
      fetchImpl,
    });
    await connection.status();
    fetchImpl.mockResolvedValue(json({ message: "secret ghu_stored" }, 401));
    await expect(connection.repositories()).rejects.toThrow(
      /expired or was revoked/,
    );
  });
});

describe("GitHub App interrupted state transitions", () => {
  it("removes a credential written after the connection deadline", async () => {
    let finishWrite!: () => void;
    const store = memoryStore();
    store.write.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );
    const connection = new GitHubAppConnection(store, config, {
      fetchImpl: fakeFetch(),
      testOnlyCallbackPort: 0,
      testOnlyAuthTimeoutMs: 30,
    });
    connections.push(connection);
    const { callback } = await begin(connection);
    await fetch(callback);
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf("function"));
    await vi.waitFor(async () =>
      expect((await connection.status()).status).toBe("failed"),
    );
    finishWrite();
    await vi.waitFor(() => expect(store.clear).toHaveBeenCalledOnce());
    expect(await connection.status()).toMatchObject({
      status: "failed",
      login: null,
    });
  });
  it("does not let a slow disconnect clobber a new connection", async () => {
    let finishClear!: () => void;
    const store = memoryStore();
    store.clear.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishClear = resolve;
        }),
    );
    const connection = new GitHubAppConnection(store, config, {
      fetchImpl: fakeFetch(),
      testOnlyCallbackPort: 0,
    });
    connections.push(connection);
    const disconnecting = connection.disconnect();
    await vi.waitFor(() => expect(finishClear).toBeTypeOf("function"));
    const next = await connection.connect();
    finishClear();
    await disconnecting;
    expect(await connection.status()).toMatchObject({
      status: "connecting",
      authorizationUrl: next.authorizationUrl,
    });
  });
  it("checks the local authorization generation without extra API calls", async () => {
    const { connection, fetchImpl } = setup({
      initial: { token: "ghu_stored", login: "mapper" },
    });
    const authorization = await connection.authorizeRepository(42);
    const count = vi.mocked(fetchImpl).mock.calls.length;
    connection.assertAuthorizationCurrent(
      authorization.identity,
      authorization.repository,
    );
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(count);
    await connection.disconnect();
    expect(() =>
      connection.assertAuthorizationCurrent(
        authorization.identity,
        authorization.repository,
      ),
    ).toThrow(/connection changed/);
  });
  it("bounds broker response bodies before parsing", async () => {
    const { connection, store } = setup({
      fetchImpl: vi.fn(async () =>
        json({ accessToken: "ghu_" + "x".repeat(20_000) }),
      ),
    });
    const { callback } = await begin(connection);
    await fetch(callback);
    await vi.waitFor(async () =>
      expect((await connection.status()).status).toBe("failed"),
    );
    expect(store.write).not.toHaveBeenCalled();
  });
});

it("clears a credential when storage fails after a possible partial promotion", async () => {
  const { connection, store } = setup();
  store.write.mockRejectedValueOnce(
    new Error("post-rename permissions failed"),
  );
  const { callback } = await begin(connection);
  await fetch(callback);
  await vi.waitFor(async () =>
    expect((await connection.status()).status).toBe("failed"),
  );
  await vi.waitFor(() => expect(store.clear).toHaveBeenCalledOnce());
});

it("excludes all-repository installations and installations missing Pages administration", async () => {
  const fetchImpl = fakeFetch();
  fetchImpl.mockImplementation(async (input) =>
    String(input).endsWith("/user")
      ? json({ login: "mapper" })
      : json({
          installations: [
            { ...installation, repository_selection: "all" },
            {
              ...installation,
              permissions: { contents: "write", pages: "write" },
            },
          ],
        }),
  );
  const { connection } = setup({
    initial: { token: "ghu_stored", login: "mapper" },
    fetchImpl,
  });
  expect(await connection.repositories()).toEqual([]);
  expect(
    fetchImpl.mock.calls.some(([url]) =>
      String(url).includes("/repositories?"),
    ),
  ).toBe(false);
});

it("rejects Write-only and unverified custom Pages roles before authorizing a publication", async () => {
  const fetchImpl = fakeFetch();
  const original = fetchImpl.getMockImplementation()!;
  fetchImpl.mockImplementation(async (input, init) =>
    String(input).includes("/repositories?")
      ? json({
          repositories: [
            {
              ...repository,
              permissions: { push: true, admin: false, maintain: false },
            },
            {
              ...repository,
              id: 43,
              role_name: "custom-pages-manager",
              permissions: { push: true },
            },
            {
              ...repository,
              id: 44,
              permissions: { push: true, maintain: true },
            },
          ],
        })
      : original(input, init),
  );
  const { connection } = setup({
    initial: { token: "ghu_stored", login: "mapper" },
    fetchImpl,
  });
  expect((await connection.repositories()).map((repo) => repo.id)).toEqual([
    44,
  ]);
  await expect(connection.authorizeRepository(42)).rejects.toThrow(
    /no longer available/,
  );
  await expect(connection.authorizeRepository(43)).rejects.toThrow(
    /no longer available/,
  );
  expect(await connection.authorizeRepository(44)).toMatchObject({
    repository: { id: 44 },
  });
  expect(
    fetchImpl.mock.calls.every(([, init]) => init?.method === undefined),
  ).toBe(true);
});
