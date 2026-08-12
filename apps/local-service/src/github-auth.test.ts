import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { credentialsPath, resolveToken } from "./github-auth.js";
import type { CommandRunner } from "./command-runner.js";
import type { CredentialStore, StoredCredentials } from "./credentials.js";

const nowhere: CommandRunner = async () => {
  throw new Error("gh is not installed");
};

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return Boolean(path) && !path.startsWith("..") && !isAbsolute(path);
}

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

const userResponse = (login: string) => jsonResponse({ login });

async function scratchCredentials(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "earth-stories-auth-"));
  return join(directory, "credentials.json");
}

describe("credentialsPath", () => {
  it("stays outside any project directory", () => {
    const path = credentialsPath();
    expect(path).toContain(".earth-stories");
    expect(isInside(process.cwd(), path)).toBe(false);
    expect(isInside(join(process.cwd(), "earth-stories-projects"), path)).toBe(
      false,
    );
  });
});

describe("resolveToken", () => {
  it("reads and clears an invalid token through the injected store", async () => {
    let stored: StoredCredentials | null = {
      token: "expired-token",
      login: "old-login",
    };
    let clears = 0;
    const store: CredentialStore = {
      read: async () => stored,
      write: async (value) => {
        stored = value;
      },
      clear: async () => {
        clears += 1;
        stored = null;
      },
    };

    const identity = await resolveToken({
      store,
      run: async () => ({ stdout: "fresh-token\n", stderr: "" }),
      fetchImpl: vi.fn(async (_input, init) =>
        String(new Headers(init?.headers).get("authorization")).includes(
          "expired-token",
        )
          ? jsonResponse({ message: "Bad credentials" }, 401)
          : userResponse("mapper"),
      ) as typeof fetch,
    });

    expect(clears).toBe(1);
    expect(identity).toEqual({
      token: "fresh-token",
      login: "mapper",
      source: "gh",
    });
  });

  it("retains stored credentials after GitHub returns 403", async () => {
    let clears = 0;
    let cliCalls = 0;
    const store: CredentialStore = {
      read: async () => ({ token: "stored-token", login: "mapper" }),
      write: async () => undefined,
      clear: async () => {
        clears += 1;
      },
    };

    await expect(
      resolveToken({
        store,
        fetchImpl: vi.fn(async () =>
          jsonResponse({ message: "rate limited" }, 403),
        ) as typeof fetch,
        run: async () => {
          cliCalls += 1;
          return { stdout: "fallback-token", stderr: "" };
        },
      }),
    ).rejects.toThrow(/verify the saved sign-in/i);
    expect(clears).toBe(0);
    expect(cliCalls).toBe(0);
  });

  it("persists a device token through the injected store", async () => {
    let stored: StoredCredentials | null = null;
    const store: CredentialStore = {
      read: async () => stored,
      write: async (value) => {
        stored = value;
      },
      clear: async () => {
        stored = null;
      },
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/login/device/code"))
        return jsonResponse({
          device_code: "device-code",
          user_code: "WXYZ-1234",
          verification_uri: "https://github.com/login/device",
          expires_in: 900,
          interval: 1,
        });
      if (url.endsWith("/login/oauth/access_token"))
        return jsonResponse({ access_token: "device-token" });
      return userResponse("mapper");
    }) as unknown as typeof fetch;

    await resolveToken({
      store,
      clientId: "client-id",
      run: nowhere,
      fetchImpl,
      sleep: async () => undefined,
    });

    expect(stored).toEqual({ token: "device-token", login: "mapper" });
  });

  it.each([
    {
      name: "network failure",
      fetchImpl: async () => {
        throw new Error("offline");
      },
      signal: undefined,
      message: /connection|respond|verify/i,
    },
    {
      name: "timeout",
      fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          ),
        ),
      signal: AbortSignal.timeout(5),
      message: /timeout|timed out|verify/i,
    },
  ])(
    "retains stored credentials after $name",
    async ({ fetchImpl, signal, message }) => {
      const stored = { token: "stored-token", login: "mapper" };
      let clears = 0;
      const store: CredentialStore = {
        read: async () => stored,
        write: async () => undefined,
        clear: async () => {
          clears += 1;
        },
      };
      let cliCalls = 0;

      await expect(
        resolveToken({
          store,
          fetchImpl: fetchImpl as typeof fetch,
          run: async () => {
            cliCalls += 1;
            return { stdout: "fresh-token", stderr: "" };
          },
          signal,
        }),
      ).rejects.toThrow(message);
      expect(clears).toBe(0);
      expect(cliCalls).toBe(0);
    },
  );

  it("retains stored credentials after caller cancellation", async () => {
    const controller = new AbortController();
    let clears = 0;
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => (requestStarted = resolve));
    const store: CredentialStore = {
      read: async () => ({ token: "stored-token", login: "mapper" }),
      write: async () => undefined,
      clear: async () => {
        clears += 1;
      },
    };
    const resolving = resolveToken({
      store,
      signal: controller.signal,
      run: nowhere,
      fetchImpl: (async (_input, init) => {
        requestStarted();
        return new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          ),
        );
      }) as typeof fetch,
    });
    await started;
    controller.abort(new Error("stop validation"));

    await expect(resolving).rejects.toThrow(/stop validation/);
    expect(clears).toBe(0);
  });

  it("cancels an in-flight GitHub request with the caller signal", async () => {
    const controller = new AbortController();
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => (requestStarted = resolve));
    const resolving = resolveToken({
      credentialsPath: await scratchCredentials(),
      clientId: "client-id",
      run: nowhere,
      signal: controller.signal,
      fetchImpl: (async (_input, init) => {
        requestStarted();
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        });
      }) as typeof fetch,
    });
    await started;
    controller.abort(new Error("stop request"));

    await expect(resolving).rejects.toThrow(/stop request/);
  });

  it("cancels an in-flight GitHub CLI lookup", async () => {
    const controller = new AbortController();
    let cliStarted!: () => void;
    const started = new Promise<void>((resolve) => (cliStarted = resolve));
    const resolving = resolveToken({
      credentialsPath: await scratchCredentials(),
      signal: controller.signal,
      run: async (command) => {
        cliStarted();
        if (!command.signal) throw new Error("CLI signal was not supplied");
        return new Promise((_, reject) =>
          command.signal?.addEventListener(
            "abort",
            () => reject(command.signal?.reason),
            { once: true },
          ),
        );
      },
    });
    await started;
    controller.abort(new Error("stop CLI"));

    await expect(resolving).rejects.toThrow(/stop CLI/);
  });

  it("cancels the device-flow wait", async () => {
    const controller = new AbortController();
    let promptShown!: () => void;
    const prompted = new Promise<void>((resolve) => (promptShown = resolve));
    let waitSignal: AbortSignal | undefined;
    const resolving = resolveToken({
      credentialsPath: await scratchCredentials(),
      clientId: "client-id",
      run: nowhere,
      signal: controller.signal,
      fetchImpl: vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith("/login/device/code")
          ? jsonResponse({
              device_code: "device-code",
              user_code: "WXYZ-1234",
              verification_uri: "https://github.com/login/device",
              expires_in: 900,
              interval: 1,
            })
          : jsonResponse({ error: "authorization_pending" }),
      ) as typeof fetch,
      sleep: async (_ms, signal) => {
        waitSignal = signal;
        return new Promise<void>(() => undefined);
      },
      onDeviceCode: () => promptShown(),
    });
    await prompted;
    controller.abort(new Error("stop wait"));

    await expect(
      Promise.race([
        resolving,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("cancellation ignored")), 100),
        ),
      ]),
    ).rejects.toThrow(/stop wait/);
    expect(waitSignal).toBe(controller.signal);
  });

  it("uses a stored token when it still works", async () => {
    const path = await scratchCredentials();
    await writeFile(
      path,
      JSON.stringify({ token: "stored-token", login: "mapper" }),
    );
    const identity = await resolveToken({
      credentialsPath: path,
      run: nowhere,
      fetchImpl: vi.fn(async () => userResponse("mapper")) as typeof fetch,
    });
    expect(identity).toEqual({
      token: "stored-token",
      login: "mapper",
      source: "stored",
    });
  });

  it("falls back to the gh CLI without copying its token to disk", async () => {
    const path = await scratchCredentials();
    const identity = await resolveToken({
      credentialsPath: path,
      run: async (command) => {
        expect(command.executable).toBe("gh");
        return { stdout: "gh-token\n", stderr: "" };
      },
      fetchImpl: vi.fn(async () => userResponse("mapper")) as typeof fetch,
    });
    expect(identity.source).toBe("gh");
    expect(identity.token).toBe("gh-token");
    await expect(readFile(path, "utf8")).rejects.toThrow();
  });

  it("stores a device-flow token privately", async () => {
    const path = await scratchCredentials();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/login/device/code"))
        return jsonResponse({
          device_code: "device-code",
          user_code: "WXYZ-1234",
          verification_uri: "https://github.com/login/device",
          expires_in: 900,
          interval: 1,
        });
      if (url.endsWith("/login/oauth/access_token"))
        return jsonResponse({ access_token: "device-token" });
      return userResponse("mapper");
    }) as unknown as typeof fetch;

    await resolveToken({
      credentialsPath: path,
      clientId: "client-id",
      run: nowhere,
      fetchImpl,
      sleep: async () => undefined,
    });
    const written = JSON.parse(await readFile(path, "utf8")) as {
      token: string;
    };
    expect(written.token).toBe("device-token");
    if (platform() !== "win32")
      expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("walks the device flow, waiting through authorization_pending", async () => {
    const path = await scratchCredentials();
    const prompts: string[] = [];
    let poll = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/login/device/code"))
        return jsonResponse({
          device_code: "device-code",
          user_code: "WXYZ-1234",
          verification_uri: "https://github.com/login/device",
          expires_in: 900,
          interval: 1,
        });
      if (url.endsWith("/login/oauth/access_token")) {
        poll += 1;
        return poll < 3
          ? jsonResponse({ error: "authorization_pending" })
          : jsonResponse({ access_token: "device-token" });
      }
      return userResponse("mapper");
    }) as unknown as typeof fetch;

    const identity = await resolveToken({
      credentialsPath: path,
      clientId: "client-id",
      run: nowhere,
      fetchImpl,
      sleep: async () => undefined,
      onDeviceCode: (prompt) => prompts.push(prompt.userCode),
    });
    expect(prompts).toEqual(["WXYZ-1234"]);
    expect(identity).toEqual({
      token: "device-token",
      login: "mapper",
      source: "device",
    });
    expect(poll).toBe(3);
  });

  it("backs off when GitHub asks it to slow down", async () => {
    const delays: number[] = [];
    let poll = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/login/device/code"))
        return jsonResponse({
          device_code: "device-code",
          user_code: "WXYZ-1234",
          verification_uri: "https://github.com/login/device",
          expires_in: 900,
          interval: 1,
        });
      if (url.endsWith("/login/oauth/access_token")) {
        poll += 1;
        return poll === 1
          ? jsonResponse({ error: "slow_down", interval: 7 })
          : jsonResponse({ access_token: "device-token" });
      }
      return userResponse("mapper");
    }) as unknown as typeof fetch;

    await resolveToken({
      credentialsPath: await scratchCredentials(),
      clientId: "client-id",
      run: nowhere,
      fetchImpl,
      sleep: async (ms) => void delays.push(ms),
    });
    expect(delays).toEqual([1000, 7000]);
  });

  it("reports a declined sign-in in plain language", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/login/device/code"))
        return jsonResponse({
          device_code: "device-code",
          user_code: "WXYZ-1234",
          verification_uri: "https://github.com/login/device",
          expires_in: 900,
          interval: 1,
        });
      return jsonResponse({ error: "access_denied" });
    }) as unknown as typeof fetch;

    await expect(
      resolveToken({
        credentialsPath: await scratchCredentials(),
        clientId: "client-id",
        run: nowhere,
        fetchImpl,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(/declined/);
  });

  it("explains what is missing when no sign-in route is available", async () => {
    await expect(
      resolveToken({
        credentialsPath: await scratchCredentials(),
        run: nowhere,
        fetchImpl: vi.fn(async () => userResponse("mapper")) as typeof fetch,
      }),
    ).rejects.toThrow(/EARTH_STORIES_GITHUB_CLIENT_ID|GitHub CLI/);
  });
});
