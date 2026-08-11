import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { credentialsPath, resolveToken } from "./github-auth.js";
import type { CommandRunner } from "./command-runner.js";

const nowhere: CommandRunner = async () => {
  throw new Error("gh is not installed");
};

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
    expect(credentialsPath()).toContain(".earth-stories");
    expect(credentialsPath()).not.toContain("earth-stories-projects");
  });
});

describe("resolveToken", () => {
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

  it("falls back to the gh CLI and stores the token privately", async () => {
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
    const written = JSON.parse(await readFile(path, "utf8")) as {
      token: string;
    };
    expect(written.token).toBe("gh-token");
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
