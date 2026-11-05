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
  permissions: { push: true },
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
        refreshToken: "never-persist",
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
