import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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

async function oneFileRelease(content = "<html></html>"): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "earth-stories-release-"));
  await writeFile(join(directory, "index.html"), content);
  return directory;
}

interface RecordedRequest {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  authorization: string | null;
}

interface FakeGitHubOptions {
  existingBlobs?: string[];
  truncated?: boolean;
  blobResponse?: (
    body: Record<string, unknown>,
    attempt: number,
  ) => Response | Promise<Response>;
  treeResponse?: Response | Error;
  commitResponse?: Response | Error;
  refResponse?: Response;
}

function fakeGitHub(options: FakeGitHubOptions = {}) {
  const requests: RecordedRequest[] = [];
  let blobAttempt = 0;
  const shaByContent: Record<string, string> = {
    "PGh0bWw+PC9odG1sPg==": "6c70bcfe4d48d15f8a6531d6b491e65d641a377c",
    cG5n: "19b11ce5720568a56161a0339ef3960adb768551",
    "Y2hhbmdlZA==": "21fb1eca31e64cd3914025058b21992ab76edcf9",
  };
  const branchExists = options.existingBlobs !== undefined;
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body
        ? (JSON.parse(await new Response(init.body).text()) as Record<
            string,
            unknown
          >)
        : null;
      requests.push({
        url,
        method,
        body,
        authorization: new Headers(init?.headers).get("authorization"),
      });

      if (url.endsWith("/git/ref/heads/gh-pages"))
        return branchExists
          ? jsonResponse({ object: { sha: "previous-commit" } })
          : jsonResponse({ message: "Not Found" }, 404);
      if (url.endsWith("/git/commits/previous-commit"))
        return jsonResponse({ tree: { sha: "previous-tree" } });
      if (url.endsWith("/git/trees/previous-tree?recursive=1"))
        return jsonResponse({
          truncated: options.truncated ?? false,
          tree: (options.existingBlobs ?? []).map((sha) => ({
            path: `old-${sha}`,
            mode: "100644",
            type: "blob",
            sha,
          })),
        });
      if (url.endsWith("/git/blobs")) {
        if (!body) throw new Error("Missing blob body");
        blobAttempt += 1;
        if (options.blobResponse)
          return options.blobResponse(body, blobAttempt);
        return jsonResponse({ sha: shaByContent[String(body.content)] }, 201);
      }
      if (url.endsWith("/git/trees")) {
        if (options.treeResponse instanceof Error) throw options.treeResponse;
        return options.treeResponse ?? jsonResponse({ sha: "new-tree" }, 201);
      }
      if (url.endsWith("/git/commits")) {
        if (options.commitResponse instanceof Error)
          throw options.commitResponse;
        return (
          options.commitResponse ?? jsonResponse({ sha: "new-commit" }, 201)
        );
      }
      if (method === "PATCH")
        return (
          options.refResponse ??
          (branchExists
            ? jsonResponse({}, 200)
            : jsonResponse({ message: "Not Found" }, 404))
        );
      if (url.endsWith("/git/refs")) return jsonResponse({}, 201);
      throw new Error(`Unexpected request: ${method} ${url}`);
    },
  ) as unknown as typeof fetch;
  return { fetchImpl, requests };
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
  it("uploads every file into an orphan commit and creates a missing branch", async () => {
    const directory = await releaseDirectory();
    const requests: Array<{
      url: string;
      method: string;
      body: Record<string, unknown> | null;
      authorization: string | null;
    }> = [];
    const blobShas = [
      "6c70bcfe4d48d15f8a6531d6b491e65d641a377c",
      "19b11ce5720568a56161a0339ef3960adb768551",
    ];
    let blobIndex = 0;
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body
          ? (JSON.parse(await new Response(init.body).text()) as Record<
              string,
              unknown
            >)
          : null;
        const headers = new Headers(init?.headers);
        requests.push({
          url,
          method,
          body,
          authorization: headers.get("authorization"),
        });

        if (url.endsWith("/git/ref/heads/gh-pages"))
          return jsonResponse({ message: "Not Found" }, 404);
        if (url.endsWith("/git/blobs"))
          return jsonResponse({ sha: blobShas[blobIndex++] }, 201);
        if (url.endsWith("/git/trees"))
          return jsonResponse({ sha: "tree-sha" }, 201);
        if (url.endsWith("/git/commits"))
          return jsonResponse({ sha: "commit-sha" }, 201);
        if (method === "PATCH")
          return jsonResponse({ message: "Reference does not exist" }, 404);
        if (url.endsWith("/git/refs")) return jsonResponse({}, 201);
        throw new Error(`Unexpected request: ${method} ${url}`);
      },
    ) as unknown as typeof fetch;

    const { branch } = await pushRelease({
      directory,
      token: "ghp_secret",
      owner: "mapper",
      repo: "field-notes",
      fetchImpl,
    });

    expect(branch).toBe("gh-pages");
    const blobs = requests.filter(({ url }) => url.endsWith("/git/blobs"));
    expect(blobs.map(({ body }) => body?.content).sort()).toEqual(
      ["PGh0bWw+PC9odG1sPg==", "cG5n"].sort(),
    );
    const tree = requests.find(({ url }) => url.endsWith("/git/trees"));
    expect(tree?.body).toEqual({
      tree: [
        {
          path: "index.html",
          mode: "100644",
          type: "blob",
          sha: "6c70bcfe4d48d15f8a6531d6b491e65d641a377c",
        },
        {
          path: "share/card-1.png",
          mode: "100644",
          type: "blob",
          sha: "19b11ce5720568a56161a0339ef3960adb768551",
        },
        { path: ".nojekyll", mode: "100644", type: "blob", content: "" },
      ],
    });
    const commit = requests.find(({ url }) => url.endsWith("/git/commits"));
    expect(commit?.body).toEqual({
      message: "Publish Earth Story",
      tree: "tree-sha",
      author: {
        name: "Earth Stories",
        email: "earth-stories@users.noreply.github.com",
      },
    });
    expect(
      requests.find(
        ({ url, method }) => url.endsWith("/git/refs") && method === "POST",
      )?.body,
    ).toEqual({ ref: "refs/heads/gh-pages", sha: "commit-sha" });
    for (const request of requests) {
      expect(request.authorization).toBe("Bearer ghp_secret");
      expect(request.url).not.toContain("ghp_secret");
    }
  });

  it("reuses every blob on an identical publish but replaces the orphan commit", async () => {
    const directory = await releaseDirectory();
    const progress: Array<{ uploaded: number; skipped: number }> = [];
    const github = fakeGitHub({
      existingBlobs: [
        "6c70bcfe4d48d15f8a6531d6b491e65d641a377c",
        "19b11ce5720568a56161a0339ef3960adb768551",
      ],
    });

    await pushRelease({
      directory,
      token: "token",
      owner: "mapper",
      repo: "notes",
      fetchImpl: github.fetchImpl,
      onProgress: (update) => progress.push(update),
    });

    expect(
      github.requests.filter(({ url }) => url.endsWith("/git/blobs")),
    ).toHaveLength(0);
    expect(
      github.requests.filter(({ url }) => url.endsWith("/git/trees")),
    ).toHaveLength(1);
    const commit = github.requests.find(({ url }) =>
      url.endsWith("/git/commits"),
    );
    expect(commit?.body).not.toHaveProperty("parents");
    expect(
      github.requests.find(({ method }) => method === "PATCH")?.body,
    ).toEqual({ sha: "new-commit", force: true });
    expect(progress).toEqual([{ uploaded: 0, skipped: 2 }]);
  });

  it("uploads only the changed blob", async () => {
    const directory = await releaseDirectory();
    await writeFile(join(directory, "index.html"), "changed");
    const github = fakeGitHub({
      existingBlobs: [
        "6c70bcfe4d48d15f8a6531d6b491e65d641a377c",
        "19b11ce5720568a56161a0339ef3960adb768551",
      ],
    });

    await pushRelease({
      directory,
      token: "token",
      owner: "mapper",
      repo: "notes",
      fetchImpl: github.fetchImpl,
    });

    const blobs = github.requests.filter(({ url }) =>
      url.endsWith("/git/blobs"),
    );
    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.body?.content).toBe("Y2hhbmdlZA==");
  });

  it("uploads every file when the previous recursive tree is truncated", async () => {
    const directory = await releaseDirectory();
    const github = fakeGitHub({
      existingBlobs: [
        "6c70bcfe4d48d15f8a6531d6b491e65d641a377c",
        "19b11ce5720568a56161a0339ef3960adb768551",
      ],
      truncated: true,
    });

    await pushRelease({
      directory,
      token: "token",
      owner: "mapper",
      repo: "notes",
      fetchImpl: github.fetchImpl,
    });

    expect(
      github.requests.filter(({ url }) => url.endsWith("/git/blobs")),
    ).toHaveLength(2);
  });

  it("synthesizes one zero-byte .nojekyll instead of uploading a release copy", async () => {
    const directory = await oneFileRelease();
    await writeFile(join(directory, ".nojekyll"), "must be replaced");
    const github = fakeGitHub();

    await pushRelease({
      directory,
      token: "token",
      owner: "mapper",
      repo: "notes",
      fetchImpl: github.fetchImpl,
    });

    expect(
      github.requests.filter(({ url }) => url.endsWith("/git/blobs")),
    ).toHaveLength(1);
    const tree = github.requests.find(({ url }) => url.endsWith("/git/trees"));
    expect(
      (tree?.body?.tree as Array<Record<string, unknown>>).filter(
        ({ path }) => path === ".nojekyll",
      ),
    ).toEqual([
      { path: ".nojekyll", mode: "100644", type: "blob", content: "" },
    ]);
  });

  it("fails when GitHub returns a different SHA for an uploaded blob", async () => {
    const directory = await oneFileRelease();
    const github = fakeGitHub({
      blobResponse: () => jsonResponse({ sha: "wrong-sha" }, 201),
    });

    await expect(
      pushRelease({
        directory,
        token: "token",
        owner: "mapper",
        repo: "notes",
        fetchImpl: github.fetchImpl,
      }),
    ).rejects.toThrow(/blob SHA.*did not match/);
  });

  it.each([403, 429])(
    "honors Retry-After on %s and then succeeds",
    async (status) => {
      const directory = await oneFileRelease();
      const timeout = vi.spyOn(globalThis, "setTimeout");
      const github = fakeGitHub({
        blobResponse: (_body, attempt) =>
          attempt === 1
            ? new Response(JSON.stringify({ message: "slow down" }), {
                status,
                headers: {
                  "content-type": "application/json",
                  "retry-after": "0.001",
                },
              })
            : jsonResponse(
                { sha: "6c70bcfe4d48d15f8a6531d6b491e65d641a377c" },
                201,
              ),
      });

      await pushRelease({
        directory,
        token: "token",
        owner: "mapper",
        repo: "notes",
        fetchImpl: github.fetchImpl,
      });

      expect(timeout).toHaveBeenCalledWith(expect.any(Function), 1);
      expect(
        github.requests.filter(({ url }) => url.endsWith("/git/blobs")),
      ).toHaveLength(2);
      timeout.mockRestore();
    },
  );

  it("names the rate limit after bounded retries are exhausted", async () => {
    const directory = await oneFileRelease();
    const github = fakeGitHub({
      blobResponse: () =>
        new Response(JSON.stringify({ message: "slow down" }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "0",
          },
        }),
    });

    await expect(
      pushRelease({
        directory,
        token: "token",
        owner: "mapper",
        repo: "notes",
        fetchImpl: github.fetchImpl,
      }),
    ).rejects.toThrow(/rate limit.*4 attempts/i);
    expect(
      github.requests.filter(({ url }) => url.endsWith("/git/blobs")),
    ).toHaveLength(4);
  });

  it("uploads no more than four blobs concurrently", async () => {
    const directory = await mkdtemp(join(tmpdir(), "earth-stories-release-"));
    for (let index = 0; index < 7; index += 1)
      await writeFile(join(directory, `file-${index}.txt`), `file ${index}`);
    let active = 0;
    let maximum = 0;
    const github = fakeGitHub({
      blobResponse: async (body) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((done) => setTimeout(done, 5));
        active -= 1;
        const contents = Buffer.from(String(body.content), "base64");
        const sha = createHash("sha1")
          .update(`blob ${contents.length}\0`)
          .update(contents)
          .digest("hex");
        return jsonResponse({ sha }, 201);
      },
    });

    await pushRelease({
      directory,
      token: "token",
      owner: "mapper",
      repo: "notes",
      fetchImpl: github.fetchImpl,
    });

    expect(maximum).toBe(4);
  });

  it("never exposes the token through URLs, errors, or progress", async () => {
    const directory = await oneFileRelease();
    const token = "ghp_private_value";
    const progress: Array<{ uploaded: number; skipped: number }> = [];
    const github = fakeGitHub({
      treeResponse: jsonResponse({ message: `failure ${token}` }, 500),
    });

    const error = await pushRelease({
      directory,
      token,
      owner: "mapper",
      repo: "notes",
      fetchImpl: github.fetchImpl,
      onProgress: (update) => progress.push(update),
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(token);
    expect(JSON.stringify(progress)).not.toContain(token);
    for (const request of github.requests) {
      expect(request.url).not.toContain(token);
      expect(request.authorization).toBe(`Bearer ${token}`);
    }
  });

  it.each([
    {
      name: "blob rejection",
      options: {
        blobResponse: () => jsonResponse({ message: "blob refused" }, 500),
      },
      message: /Uploading index.html failed \(500\).*blob refused/,
    },
    {
      name: "tree creation failure",
      options: {
        treeResponse: jsonResponse({ message: "tree refused" }, 422),
      },
      message: /Creating the publication tree failed \(422\).*tree refused/,
    },
    {
      name: "ref update conflict",
      options: {
        existingBlobs: [] as string[],
        refResponse: jsonResponse({ message: "ref conflict" }, 409),
      },
      message: /Updating the publication branch failed \(409\).*ref conflict/,
    },
    {
      name: "network interruption before commit",
      options: { commitResponse: new Error("connection reset") },
      message: /Creating the publication commit failed.*connection reset/,
    },
  ])("reports a clear $name", async ({ options, message }) => {
    const directory = await oneFileRelease();
    const github = fakeGitHub(options);
    await expect(
      pushRelease({
        directory,
        token: "token",
        owner: "mapper",
        repo: "notes",
        fetchImpl: github.fetchImpl,
      }),
    ).rejects.toThrow(message);
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

  it("aborts a request that would outlive the deadline", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    ) as unknown as typeof fetch;
    await expect(
      waitForPages("https://mapper.github.io/notes/", {
        fetchImpl,
        deadlineMs: 50,
        intervalMs: 1,
        sleep: async () => undefined,
      }),
    ).resolves.toBe(false);
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
