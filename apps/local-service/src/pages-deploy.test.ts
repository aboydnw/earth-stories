import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Command } from "./command-runner.js";
import {
  enablePages,
  ensureRepository,
  pagesUrl,
  pushRelease,
  slugRepoName,
  waitForPages,
} from "./pages-deploy.js";

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

async function releaseDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "earth-stories-release-"));
  await writeFile(join(directory, "index.html"), "<html></html>");
  await mkdir(join(directory, "share"), { recursive: true });
  await writeFile(join(directory, "share", "card-1.png"), "png");
  return directory;
}

describe("slugRepoName", () => {
  it("turns a title into a usable repository name", () => {
    expect(slugRepoName("Field Notes: A Coastline, Mapped")).toBe(
      "field-notes-a-coastline-mapped",
    );
    expect(slugRepoName("Küstenlinie")).toBe("kustenlinie");
    expect(slugRepoName("  ")).toBe("earth-story");
    expect(slugRepoName("!!!")).toBe("earth-story");
  });

  it("never ends with a separator after truncation", () => {
    const slug = slugRepoName("a ".repeat(120));
    expect(slug.length).toBeLessThanOrEqual(90);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("pagesUrl", () => {
  it("builds the predictable project-site URL", () => {
    expect(pagesUrl("Mapper", "field-notes")).toBe(
      "https://mapper.github.io/field-notes/",
    );
  });
});

describe("ensureRepository", () => {
  it("creates the repository when it does not exist", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "POST"
          ? jsonResponse({ name: "field-notes" }, 201)
          : jsonResponse({ message: "Not Found" }, 404),
    ) as unknown as typeof fetch;
    const result = await ensureRepository({
      token: "t",
      owner: "mapper",
      repo: "field-notes",
      fetchImpl,
    });
    expect(result.created).toBe(true);
  });

  it("adopts an empty repository the author already owns", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ owner: { login: "mapper" }, size: 0 }),
    ) as unknown as typeof fetch;
    await expect(
      ensureRepository({
        token: "t",
        owner: "mapper",
        repo: "field-notes",
        fetchImpl,
      }),
    ).resolves.toEqual({ created: false });
  });

  it("refuses to overwrite an unrelated repository with files in it", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ owner: { login: "mapper" }, size: 4096 }),
    ) as unknown as typeof fetch;
    await expect(
      ensureRepository({
        token: "t",
        owner: "mapper",
        repo: "notes",
        fetchImpl,
      }),
    ).rejects.toThrow(/Choose another name/);
  });

  it("reuses a repository this story already published to", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ owner: { login: "mapper" }, size: 4096 }),
    ) as unknown as typeof fetch;
    await expect(
      ensureRepository({
        token: "t",
        owner: "mapper",
        repo: "notes",
        expectExisting: true,
        fetchImpl,
      }),
    ).resolves.toEqual({ created: false });
  });

  it("stops when the name belongs to someone else", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ owner: { login: "someone-else" }, size: 0 }),
    ) as unknown as typeof fetch;
    await expect(
      ensureRepository({
        token: "t",
        owner: "mapper",
        repo: "notes",
        fetchImpl,
      }),
    ).rejects.toThrow(/belongs to someone else/);
  });
});

describe("pushRelease", () => {
  it("pushes an orphan commit from a copy, never the project folder", async () => {
    const directory = await releaseDirectory();
    const commands: Command[] = [];
    const { branch } = await pushRelease({
      directory,
      token: "ghp_secret",
      owner: "mapper",
      repo: "field-notes",
      run: async (command) => {
        commands.push(command);
        return { stdout: "", stderr: "" };
      },
    });

    expect(branch).toBe("gh-pages");
    expect(commands.map(({ args }) => args[0])).toEqual([
      "init",
      "add",
      "-c",
      "push",
    ]);
    for (const command of commands) {
      expect(command.executable).toBe("git");
      expect(command.cwd).not.toBe(directory);
      expect(command.cwd).toContain("earth-stories-publish-");
      expect(command.secrets).toContain("ghp_secret");
    }
    expect(commands.at(-1)?.args).toContain("--force");
  });

  it("keeps the token out of every command that is not the push", async () => {
    const directory = await releaseDirectory();
    const commands: Command[] = [];
    await pushRelease({
      directory,
      token: "ghp_secret",
      owner: "mapper",
      repo: "field-notes",
      run: async (command) => {
        commands.push(command);
        return { stdout: "", stderr: "" };
      },
    });
    const withToken = commands.filter(({ args }) =>
      args.some((arg) => arg.includes("ghp_secret")),
    );
    expect(withToken).toHaveLength(1);
    expect(withToken[0]?.args[0]).toBe("push");
  });
});

describe("enablePages", () => {
  it("enables Pages on the pushed branch", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(init?.method ?? "GET");
        return jsonResponse({}, 201);
      },
    ) as unknown as typeof fetch;
    await enablePages({
      token: "t",
      owner: "mapper",
      repo: "notes",
      fetchImpl,
    });
    expect(calls).toEqual(["POST"]);
  });

  it("updates the source when a site already exists", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(init?.method ?? "GET");
        return init?.method === "POST"
          ? jsonResponse({ message: "already exists" }, 409)
          : jsonResponse({}, 200);
      },
    ) as unknown as typeof fetch;
    await enablePages({
      token: "t",
      owner: "mapper",
      repo: "notes",
      fetchImpl,
    });
    expect(calls).toEqual(["POST", "PUT"]);
  });

  it("reports an unexpected failure with GitHub's explanation", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: "Resource not accessible" }, 403),
    ) as unknown as typeof fetch;
    await expect(
      enablePages({ token: "t", owner: "mapper", repo: "notes", fetchImpl }),
    ).rejects.toThrow(/Resource not accessible/);
  });
});

describe("waitForPages", () => {
  it("returns once the site serves the story", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return calls < 3
        ? new Response("", { status: 404 })
        : new Response("<html></html>", { status: 200 });
    }) as unknown as typeof fetch;
    const attempts: number[] = [];
    await expect(
      waitForPages("https://mapper.github.io/notes/", {
        fetchImpl,
        sleep: async () => undefined,
        onAttempt: (attempt) => attempts.push(attempt),
      }),
    ).resolves.toBe(true);
    expect(attempts).toEqual([1, 2, 3]);
  });

  it("keeps waiting while the first build refuses connections", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error("ECONNREFUSED");
      return new Response("<html></html>", { status: 200 });
    }) as unknown as typeof fetch;
    await expect(
      waitForPages("https://mapper.github.io/notes/", {
        fetchImpl,
        sleep: async () => undefined,
      }),
    ).resolves.toBe(true);
  });

  it("gives up at the deadline instead of hanging", async () => {
    let clock = 0;
    const fetchImpl = vi.fn(
      async () => new Response("", { status: 404 }),
    ) as unknown as typeof fetch;
    await expect(
      waitForPages("https://mapper.github.io/notes/", {
        fetchImpl,
        deadlineMs: 10_000,
        intervalMs: 5_000,
        now: () => clock,
        sleep: async (ms) => void (clock += ms),
      }),
    ).resolves.toBe(false);
  });
});
