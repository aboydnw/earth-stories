import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

function cancellableResponse(status: number, onCancel: () => void): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("unused response body"));
    },
    cancel() {
      onCancel();
    },
  });
  return new Response(body, { status });
}

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
  readRefResponse?: Response;
  blobResponse?: (
    body: Record<string, unknown>,
    attempt: number,
  ) => Response | Promise<Response>;
  treeResponse?: Response | Error;
  commitResponse?: Response | Error;
  refResponse?: Response;
  createRefResponse?: Response;
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
        return (
          options.readRefResponse ??
          (branchExists
            ? jsonResponse({ object: { sha: "previous-commit" } })
            : jsonResponse({ message: "Not Found" }, 404))
        );
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
      if (url.endsWith("/git/refs"))
        return options.createRefResponse ?? jsonResponse({}, 201);
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
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST")
          return jsonResponse({ name: "field-notes" }, 201);
        if (init?.method === "PUT")
          return jsonResponse({ commit: { sha: "seed" } }, 201);
        return jsonResponse({ message: "Not Found" }, 404);
      },
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
    const methods: string[] = [];
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        methods.push(init?.method ?? "GET");
        return init?.method === "PUT"
          ? jsonResponse({ commit: { sha: "seed" } }, 201)
          : jsonResponse({ owner: { login: "mapper" }, size: 0 });
      },
    ) as unknown as typeof fetch;
    await expect(
      ensureRepository({
        token: "t",
        owner: "mapper",
        repo: "field-notes",
        fetchImpl,
      }),
    ).resolves.toEqual({ created: false });
    expect(methods).toEqual(["GET", "PUT"]);
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

  it.each(["new", "adopted"] as const)(
    "seeds a %s empty repository before creating the orphan Pages branch",
    async (kind) => {
      const directory = await oneFileRelease();
      const token = "ghp_private_value";
      const requests: RecordedRequest[] = [];
      let repositoryExists = kind === "adopted";
      let defaultBranchExists = false;
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

          if (url.endsWith("/repos/mapper/notes") && method === "GET")
            return repositoryExists
              ? jsonResponse({ owner: { login: "mapper" }, size: 0 })
              : jsonResponse({ message: "Not Found" }, 404);
          if (url.endsWith("/user/repos")) {
            repositoryExists = true;
            return jsonResponse({ name: "notes" }, 201);
          }
          if (url.endsWith("/contents/.earth-stories-seed")) {
            defaultBranchExists = true;
            return jsonResponse({ commit: { sha: "seed-commit" } }, 201);
          }
          if (url.endsWith("/git/ref/heads/gh-pages"))
            return jsonResponse({ message: "Not Found" }, 404);
          if (url.endsWith("/git/blobs")) {
            const contents = Buffer.from(String(body?.content), "base64");
            const sha = createHash("sha1")
              .update(`blob ${contents.length}\0`)
              .update(contents)
              .digest("hex");
            return jsonResponse({ sha }, 201);
          }
          if (url.endsWith("/git/trees"))
            return jsonResponse({ sha: "publication-tree" }, 201);
          if (url.endsWith("/git/commits"))
            return jsonResponse({ sha: "publication-commit" }, 201);
          if (method === "PATCH")
            return jsonResponse({ message: "Not Found" }, 404);
          if (url.endsWith("/git/refs"))
            return defaultBranchExists
              ? jsonResponse({}, 201)
              : jsonResponse(
                  { message: "Cannot create the first branch through refs" },
                  422,
                );
          throw new Error(`Unexpected request: ${method} ${url}`);
        },
      ) as unknown as typeof fetch;

      await ensureRepository({
        token,
        owner: "mapper",
        repo: "notes",
        fetchImpl,
      });
      await expect(
        pushRelease({
          directory,
          token,
          owner: "mapper",
          repo: "notes",
          fetchImpl,
        }),
      ).resolves.toEqual({ branch: "gh-pages" });

      const seed = requests.find(({ url }) =>
        url.endsWith("/contents/.earth-stories-seed"),
      );
      expect(seed?.method).toBe("PUT");
      expect(seed?.body).toEqual({
        message: "Initialize Earth Stories repository",
        content: "RWFydGggU3RvcmllcyBwdWJsaWNhdGlvbiByZXBvc2l0b3J5Cg==",
      });
      expect(seed?.body).not.toHaveProperty("branch");
      const publicationCommit = requests.find(({ url }) =>
        url.endsWith("/git/commits"),
      );
      expect(publicationCommit?.body).not.toHaveProperty("parents");
      expect(
        requests.findIndex(({ url }) =>
          url.endsWith("/contents/.earth-stories-seed"),
        ),
      ).toBeLessThan(
        requests.findIndex(({ url }) => url.endsWith("/git/refs")),
      );
      for (const request of requests) {
        expect(request.authorization).toBe(`Bearer ${token}`);
        expect(request.url).not.toContain(token);
      }
    },
  );

  it("redacts the token when default-branch initialization fails", async () => {
    const token = "ghp_seed_secret";
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "PUT"
          ? jsonResponse({ message: `seed denied for ${token}` }, 500)
          : jsonResponse({ owner: { login: "mapper" }, size: 0 }),
    ) as unknown as typeof fetch;

    const error = await ensureRepository({
      token,
      owner: "mapper",
      repo: "notes",
      fetchImpl,
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/default branch.*500/i);
    expect((error as Error).message).not.toContain(token);
  });

  it("reuses an existing seed after an interrupted first publish", async () => {
    const methods: string[] = [];
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        methods.push(`${method} ${url}`);
        if (url.endsWith("/contents/.earth-stories-seed"))
          return method === "PUT"
            ? jsonResponse({ message: "sha was not supplied" }, 422)
            : jsonResponse({
                type: "file",
                encoding: "base64",
                content: "RWFydGggU3RvcmllcyBwdWJsaWNhdGlvbiByZXBvc2l0b3J5Cg==",
              });
        return jsonResponse({ owner: { login: "mapper" }, size: 0 });
      },
    ) as unknown as typeof fetch;

    await expect(
      ensureRepository({
        token: "token",
        owner: "mapper",
        repo: "notes",
        fetchImpl,
      }),
    ).resolves.toEqual({ created: false });
    expect(methods.map((entry) => entry.split(" ")[0])).toEqual([
      "GET",
      "PUT",
      "GET",
    ]);
  });

  it.each(["seed-only", "gh-pages"] as const)(
    "safely resumes an interrupted %s publish without a local record",
    async (interruption) => {
      const directory = await oneFileRelease();
      const requests: RecordedRequest[] = [];
      let repositoryExists = false;
      let seedContent: string | null = null;
      let ghPagesExists = false;
      let publicationCommits = 0;
      const indexSha = "6c70bcfe4d48d15f8a6531d6b491e65d641a377c";
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

          if (url.endsWith("/repos/mapper/notes") && method === "GET")
            return repositoryExists
              ? jsonResponse({
                  owner: { login: "mapper" },
                  size: seedContent || ghPagesExists ? 1 : 0,
                })
              : jsonResponse({ message: "Not Found" }, 404);
          if (url.endsWith("/user/repos")) {
            repositoryExists = true;
            return jsonResponse({ name: "notes" }, 201);
          }
          if (url.endsWith("/contents/.earth-stories-seed")) {
            if (method === "PUT") {
              seedContent = String(body?.content);
              return jsonResponse({ commit: { sha: "seed-commit" } }, 201);
            }
            return seedContent
              ? jsonResponse({
                  type: "file",
                  encoding: "base64",
                  content: `${seedContent.slice(0, 32)}\n${seedContent.slice(32)}`,
                })
              : jsonResponse({ message: "Not Found" }, 404);
          }
          if (url.endsWith("/git/ref/heads/gh-pages"))
            return ghPagesExists
              ? jsonResponse({ object: { sha: "old-commit" } })
              : jsonResponse({ message: "Not Found" }, 404);
          if (url.endsWith("/git/commits/old-commit"))
            return jsonResponse({ tree: { sha: "old-tree" } });
          if (url.endsWith("/git/trees/old-tree?recursive=1"))
            return jsonResponse({
              truncated: false,
              tree: [
                {
                  path: "index.html",
                  mode: "100644",
                  type: "blob",
                  sha: indexSha,
                },
              ],
            });
          if (url.endsWith("/git/blobs"))
            return jsonResponse({ sha: indexSha }, 201);
          if (url.endsWith("/git/trees"))
            return jsonResponse({ sha: `tree-${publicationCommits + 1}` }, 201);
          if (url.endsWith("/git/commits")) {
            publicationCommits += 1;
            return jsonResponse({ sha: `commit-${publicationCommits}` }, 201);
          }
          if (method === "PATCH")
            return ghPagesExists
              ? jsonResponse({}, 200)
              : jsonResponse({ message: "Not Found" }, 404);
          if (url.endsWith("/git/refs")) {
            if (!seedContent)
              return jsonResponse({ message: "No default branch" }, 422);
            ghPagesExists = true;
            return jsonResponse({}, 201);
          }
          throw new Error(`Unexpected request: ${method} ${url}`);
        },
      ) as unknown as typeof fetch;

      await ensureRepository({
        token: "token",
        owner: "mapper",
        repo: "notes",
        fetchImpl,
      });
      if (interruption === "gh-pages")
        await pushRelease({
          directory,
          token: "token",
          owner: "mapper",
          repo: "notes",
          fetchImpl,
        });

      await expect(
        ensureRepository({
          token: "token",
          owner: "mapper",
          repo: "notes",
          expectExisting: false,
          fetchImpl,
        }),
      ).resolves.toEqual({ created: false });
      await pushRelease({
        directory,
        token: "token",
        owner: "mapper",
        repo: "notes",
        fetchImpl,
      });

      expect(
        requests.filter(
          ({ url, method }) =>
            url.endsWith("/contents/.earth-stories-seed") && method === "PUT",
        ),
      ).toHaveLength(1);
      expect(
        requests.filter(
          ({ url, method }) =>
            url.endsWith("/contents/.earth-stories-seed") && method === "GET",
        ),
      ).toHaveLength(1);
      expect(ghPagesExists).toBe(true);
      expect(publicationCommits).toBe(interruption === "gh-pages" ? 2 : 1);
    },
  );

  it.each([
    {
      name: "missing",
      response: () => jsonResponse({ message: "Not Found" }, 404),
    },
    {
      name: "wrong",
      response: () =>
        jsonResponse({
          type: "file",
          encoding: "base64",
          content: "d3JvbmcK",
        }),
    },
    {
      name: "malformed",
      response: () =>
        jsonResponse({
          type: "file",
          encoding: "base64",
          content: "%%%not-base64%%%",
        }),
    },
  ])(
    "refuses a nonempty repository with a $name seed marker",
    async ({ response }) => {
      let markerRequests = 0;
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/contents/.earth-stories-seed")) {
          markerRequests += 1;
          return response();
        }
        return jsonResponse({ owner: { login: "mapper" }, size: 1 });
      }) as unknown as typeof fetch;

      await expect(
        ensureRepository({
          token: "token",
          owner: "mapper",
          repo: "notes",
          expectExisting: false,
          fetchImpl,
        }),
      ).rejects.toThrow(/Choose another name/);
      expect(markerRequests).toBe(1);
    },
  );

  it("redacts a token echoed by a failed interrupted-publish probe", async () => {
    const token = "ghp_probe_secret";
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      return url.endsWith("/contents/.earth-stories-seed")
        ? jsonResponse({ message: `probe denied for ${token}` }, 500)
        : jsonResponse({ owner: { login: "mapper" }, size: 1 });
    }) as unknown as typeof fetch;

    const error = await ensureRepository({
      token,
      owner: "mapper",
      repo: "notes",
      expectExisting: false,
      fetchImpl,
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/verify.*interrupted/i);
    expect((error as Error).message).not.toContain(token);
    for (const url of urls) expect(url).not.toContain(token);
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
    const shaByContent: Record<string, string> = {
      "PGh0bWw+PC9odG1sPg==": "6c70bcfe4d48d15f8a6531d6b491e65d641a377c",
      cG5n: "19b11ce5720568a56161a0339ef3960adb768551",
    };
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
          return jsonResponse(
            { sha: shaByContent[String(body?.content)] },
            201,
          );
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
    let cancelled = 0;
    const github = fakeGitHub({
      blobResponse: () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode('{"message":"slow down"}'),
              );
            },
            cancel() {
              cancelled += 1;
            },
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": "0",
            },
          },
        ),
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
    expect(cancelled).toBe(4);
  });

  it.each(["create", "update"] as const)(
    "cancels terminal ref responses after a successful %s",
    async (mode) => {
      const directory = await oneFileRelease();
      const cancelled: string[] = [];
      const github = fakeGitHub(
        mode === "create"
          ? {
              readRefResponse: cancellableResponse(404, () =>
                cancelled.push("read-missing"),
              ),
              refResponse: cancellableResponse(404, () =>
                cancelled.push("update-missing"),
              ),
              createRefResponse: cancellableResponse(201, () =>
                cancelled.push("create-success"),
              ),
            }
          : {
              existingBlobs: [],
              refResponse: cancellableResponse(200, () =>
                cancelled.push("update-success"),
              ),
            },
      );

      await pushRelease({
        directory,
        token: "token",
        owner: "mapper",
        repo: "notes",
        fetchImpl: github.fetchImpl,
      });

      expect(cancelled).toEqual(
        mode === "create"
          ? ["read-missing", "update-missing", "create-success"]
          : ["update-success"],
      );
    },
  );

  it.each([
    ["numeric", "3600"],
    ["HTTP-date", new Date(Date.now() + 3_600_000).toUTCString()],
  ])("caps an excessive %s Retry-After delay", async (_kind, retryAfter) => {
    const directory = await oneFileRelease();
    const timeout = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((callback) => {
        queueMicrotask(callback as () => void);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });
    const github = fakeGitHub({
      blobResponse: (_body, attempt) =>
        attempt === 1
          ? new Response(JSON.stringify({ message: "slow down" }), {
              status: 429,
              headers: {
                "content-type": "application/json",
                "retry-after": retryAfter,
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

    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 60_000);
    timeout.mockRestore();
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

  it("waits for sibling uploads to stop and emits no progress after one fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "earth-stories-release-"));
    for (let index = 0; index < 7; index += 1)
      await writeFile(join(directory, `file-${index}.txt`), `file ${index}`);
    const progress: Array<{ uploaded: number; skipped: number }> = [];
    let started = 0;
    let aborted = 0;
    let releaseFirstFailure: (() => void) | undefined;
    const allWorkersStarted = new Promise<void>((resolve) => {
      releaseFirstFailure = resolve;
    });
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/git/ref/heads/gh-pages"))
          return jsonResponse({ message: "Not Found" }, 404);
        if (!url.endsWith("/git/blobs"))
          throw new Error(
            `Unexpected request: ${init?.method ?? "GET"} ${url}`,
          );

        started += 1;
        if (started === 4) releaseFirstFailure?.();
        const body = init?.body as ReadableStream<Uint8Array>;
        if (started === 1) {
          await allWorkersStarted;
          await body.cancel("server rejected upload");
          return jsonResponse({ message: "blob refused" }, 500);
        }
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              aborted += 1;
              void body.cancel("sibling upload failed");
              reject(new Error("aborted sibling upload"));
            },
            { once: true },
          );
        });
      },
    ) as unknown as typeof fetch;

    await expect(
      pushRelease({
        directory,
        token: "token",
        owner: "mapper",
        repo: "notes",
        fetchImpl,
        onProgress: (update) => progress.push(update),
      }),
    ).rejects.toThrow(/blob refused/);
    const progressAtFailure = [...progress];
    await new Promise((done) => setTimeout(done, 10));

    expect(started).toBe(4);
    expect(aborted).toBe(3);
    expect(progress).toEqual(progressAtFailure);
    expect(progress).toEqual([{ uploaded: 0, skipped: 0 }]);
  });

  it("sends blob JSON as a cancellable stream on an early rejection", async () => {
    const directory = await oneFileRelease();
    let cancelled = false;
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/git/ref/heads/gh-pages"))
          return jsonResponse({ message: "Not Found" }, 404);
        if (!url.endsWith("/git/blobs"))
          throw new Error(
            `Unexpected request: ${init?.method ?? "GET"} ${url}`,
          );
        expect(init?.body).toBeInstanceOf(ReadableStream);
        expect(typeof init?.body).not.toBe("string");
        const reader = (init?.body as ReadableStream<Uint8Array>).getReader();
        const first = await reader.read();
        expect(new TextDecoder().decode(first.value)).toBe('{"content":"');
        await reader.cancel("server stopped reading");
        cancelled = true;
        return jsonResponse({ message: "payload rejected" }, 413);
      },
    ) as unknown as typeof fetch;

    await expect(
      pushRelease({
        directory,
        token: "token",
        owner: "mapper",
        repo: "notes",
        fetchImpl,
      }),
    ).rejects.toThrow(/payload rejected/);
    expect(cancelled).toBe(true);
  });

  it("reports a file read failure from the streamed upload body", async () => {
    const directory = await oneFileRelease();
    let removed = false;
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/git/ref/heads/gh-pages")) {
          await rm(join(directory, "index.html"));
          removed = true;
          return jsonResponse({ message: "Not Found" }, 404);
        }
        if (!url.endsWith("/git/blobs"))
          throw new Error(
            `Unexpected request: ${init?.method ?? "GET"} ${url}`,
          );
        await new Response(init?.body).text();
        throw new Error("stream unexpectedly succeeded");
      },
    ) as unknown as typeof fetch;

    await expect(
      pushRelease({
        directory,
        token: "token",
        owner: "mapper",
        repo: "notes",
        fetchImpl,
      }),
    ).rejects.toThrow(/Uploading index.html failed.*ENOENT/);
    expect(removed).toBe(true);
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
