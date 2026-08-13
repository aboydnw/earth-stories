import { mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultWorkspace,
  looksLikeWorkspace,
  readWorkspacePointer,
  validateWorkspace,
  writeWorkspacePointer,
} from "./workspace.js";

const roots: string[] = [];

function failWritableProbeAt(operation: "writeFile" | "sync"): typeof open {
  return (async (path, flags, mode) => {
    const handle = await open(path, flags, mode);
    if (!String(path).includes(".earth-stories-write-")) return handle;
    return new Proxy(handle, {
      get(target, property) {
        if (property === operation) {
          return async () => {
            throw Object.assign(new Error(`${operation} unavailable`), {
              code: "ENOTSUP",
            });
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as typeof open;
}

function failProbeCloseAt(probe: "write" | "lock"): typeof open {
  return (async (path, flags, mode) => {
    const handle = await open(path, flags, mode);
    if (!String(path).includes(`.earth-stories-${probe}-`)) return handle;
    return new Proxy(handle, {
      get(target, property) {
        if (property === "close") {
          return async () => {
            await target.close();
            throw Object.assign(new Error("close unavailable"), {
              code: "EIO",
            });
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as typeof open;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("defaultWorkspace", () => {
  it.each([
    ["linux", "/home/author/Documents", "/home/author/Documents/Earth Stories"],
    [
      "darwin",
      "/Users/author/Documents",
      "/Users/author/Documents/Earth Stories",
    ],
    [
      "win32",
      "C:\\Users\\author\\Documents",
      "C:\\Users\\author\\Documents\\Earth Stories",
    ],
  ] as const)(
    "uses the %s Documents directory",
    (platform, documents, want) => {
      expect(defaultWorkspace(documents, platform)).toBe(want);
    },
  );
});

describe("validateWorkspace", () => {
  it.each([
    {
      probe: "write" as const,
      code: "close-file-failed",
      message:
        "Earth Stories could not finish closing a test file in this folder. Choose another folder for reliable saves.",
    },
    {
      probe: "lock" as const,
      code: "close-lock-failed",
      message:
        "Earth Stories could not finish closing a lock file in this folder. Choose another folder.",
    },
  ])(
    "returns an author-facing finding when the $probe probe cannot close",
    async ({ probe, code, message }) => {
      const candidate = await temporaryDirectory(`${probe}-close-failure`);

      await expect(
        validateWorkspace(candidate, { open: failProbeCloseAt(probe) }),
      ).resolves.toEqual({
        ok: false,
        findings: [{ code, severity: "error", message }],
      });
      expect(await readdir(candidate)).toEqual([]);
    },
  );

  it("accepts a writable path containing spaces and Unicode", async () => {
    const root = await temporaryDirectory("validation");
    const candidate = join(root, "Field notes – 河");
    await mkdir(candidate);

    await expect(validateWorkspace(candidate)).resolves.toEqual({
      ok: true,
      findings: [],
    });
    expect(await readdir(candidate)).toEqual([]);
  });

  it("returns an author-facing finding when the parent is missing", async () => {
    const root = await temporaryDirectory("missing-parent");
    const candidate = join(root, "missing", "stories");

    await expect(validateWorkspace(candidate)).resolves.toEqual({
      ok: false,
      findings: [
        {
          code: "not-found",
          severity: "error",
          message:
            "This folder does not exist. Choose an existing folder or create it first.",
        },
      ],
    });
  });

  it("returns an author-facing finding when the folder cannot be inspected", async () => {
    const candidate = await temporaryDirectory("inspect-failure");

    await expect(
      validateWorkspace(candidate, {
        stat: async () => {
          throw Object.assign(new Error("access denied"), { code: "EACCES" });
        },
      }),
    ).resolves.toEqual({
      ok: false,
      findings: [
        {
          code: "inspect-failed",
          severity: "error",
          message:
            "Earth Stories could not inspect this folder. Check that it is available and that you have permission to use it.",
        },
      ],
    });
  });

  it("returns an author-facing finding when the path is a file", async () => {
    const root = await temporaryDirectory("not-directory");
    const candidate = join(root, "stories.txt");
    await writeFile(candidate, "not a workspace");

    await expect(validateWorkspace(candidate)).resolves.toEqual({
      ok: false,
      findings: [
        {
          code: "not-directory",
          severity: "error",
          message:
            "This location is a file, not a folder. Choose a folder for your stories.",
        },
      ],
    });
  });

  it("rejects a read-only directory with an author-facing finding", async () => {
    const candidate = await temporaryDirectory("read-only");
    const denyFileCreation: typeof open = async () => {
      throw Object.assign(new Error("read-only filesystem"), {
        code: "EROFS",
      });
    };

    await expect(
      validateWorkspace(candidate, { open: denyFileCreation }),
    ).resolves.toEqual({
      ok: false,
      findings: [
        {
          code: "create-file-failed",
          severity: "error",
          message:
            "Earth Stories could not create a test file in this folder. Choose a folder where you can add files.",
        },
      ],
    });
  });

  it("rejects a directory where atomic rename fails", async () => {
    const candidate = await temporaryDirectory("rename-failure");

    await expect(
      validateWorkspace(candidate, {
        rename: async () => {
          throw Object.assign(new Error("rename unavailable"), {
            code: "ENOTSUP",
          });
        },
      }),
    ).resolves.toEqual({
      ok: false,
      findings: [
        {
          code: "rename-failed",
          severity: "error",
          message:
            "This folder cannot safely replace saved files. Choose another folder for reliable saves.",
        },
      ],
    });
    expect(await readdir(candidate)).toEqual([]);
  });

  it.each([
    {
      operation: "writeFile" as const,
      code: "write-file-failed",
      message:
        "Earth Stories could not write a test file in this folder. Choose another folder.",
    },
    {
      operation: "sync" as const,
      code: "sync-file-failed",
      message:
        "This folder could not finish a safe test write. Choose another folder for reliable saves.",
    },
  ])(
    "returns an author-facing finding when $operation fails",
    async ({ operation, code, message }) => {
      const candidate = await temporaryDirectory(`${operation}-failure`);

      await expect(
        validateWorkspace(candidate, {
          open: failWritableProbeAt(operation),
        }),
      ).resolves.toEqual({
        ok: false,
        findings: [{ code, severity: "error", message }],
      });
      expect(await readdir(candidate)).toEqual([]);
    },
  );

  it("returns an author-facing finding when subdirectory creation fails", async () => {
    const candidate = await temporaryDirectory("mkdir-failure");

    await expect(
      validateWorkspace(candidate, {
        mkdir: async () => {
          throw Object.assign(new Error("mkdir unavailable"), {
            code: "ENOTSUP",
          });
        },
      }),
    ).resolves.toEqual({
      ok: false,
      findings: [
        {
          code: "create-subdirectory-failed",
          severity: "error",
          message:
            "Earth Stories could not create a project folder here. Choose another folder.",
        },
      ],
    });
  });

  it("returns an author-facing finding when subdirectory removal fails", async () => {
    const candidate = await temporaryDirectory("rmdir-failure");
    const removeExceptSubdirectories: typeof rm = async (path, options) => {
      if (
        String(path).includes(".earth-stories-directory-") &&
        !options?.force
      ) {
        throw Object.assign(new Error("rmdir unavailable"), {
          code: "ENOTSUP",
        });
      }
      return rm(path, options);
    };

    await expect(
      validateWorkspace(candidate, { rm: removeExceptSubdirectories }),
    ).resolves.toEqual({
      ok: false,
      findings: [
        {
          code: "remove-subdirectory-failed",
          severity: "error",
          message:
            "Earth Stories could not remove a test folder here. Choose another folder.",
        },
      ],
    });
  });

  it.each(["rename", "lock"] as const)(
    "returns an author-facing finding when the %s probe file cannot be removed",
    async (probe) => {
      const candidate = await temporaryDirectory(`${probe}-remove-failure`);
      const removeExceptProbeFile: typeof rm = async (path, options) => {
        if (
          String(path).includes(`.earth-stories-${probe}-`) &&
          !options?.force
        ) {
          throw Object.assign(new Error("remove unavailable"), { code: "EIO" });
        }
        return rm(path, options);
      };

      await expect(
        validateWorkspace(candidate, { rm: removeExceptProbeFile }),
      ).resolves.toEqual({
        ok: false,
        findings: [
          {
            code: "cleanup-failed",
            severity: "error",
            message:
              "Earth Stories could not remove a test file from this folder. Choose another folder.",
          },
        ],
      });
      expect(await readdir(candidate)).toEqual([]);
    },
  );

  it("rejects a directory where exclusive lock creation fails", async () => {
    const candidate = await temporaryDirectory("exclusive-failure");
    const openExceptForLocks: typeof open = async (path, flags, mode) => {
      if (String(path).includes(".earth-stories-lock-")) {
        await writeFile(path, "an existing lock", { flag: "wx" });
      }
      return open(path, flags, mode);
    };

    await expect(
      validateWorkspace(candidate, { open: openExceptForLocks }),
    ).resolves.toEqual({
      ok: false,
      findings: [
        {
          code: "exclusive-create-failed",
          severity: "error",
          message:
            "This folder cannot create the lock files that protect stories from conflicting saves. Choose another folder.",
        },
      ],
    });
    expect(await readdir(candidate)).toEqual([]);
  });

  it("rejects a filesystem that silently makes wx non-exclusive", async () => {
    const candidate = await temporaryDirectory("degraded-exclusive-create");
    const openWithDegradedExclusiveCreate: typeof open = async (
      path,
      flags,
      mode,
    ) => open(path, flags === "wx" ? "w" : flags, mode);

    await expect(
      validateWorkspace(candidate, { open: openWithDegradedExclusiveCreate }),
    ).resolves.toEqual({
      ok: false,
      findings: [
        {
          code: "exclusive-create-failed",
          severity: "error",
          message:
            "This folder cannot create the lock files that protect stories from conflicting saves. Choose another folder.",
        },
      ],
    });
    expect(await readdir(candidate)).toEqual([]);
  });

  it("accepts a very long workspace path when its capabilities pass", async () => {
    const root = await temporaryDirectory("long-path");
    const candidate = join(
      root,
      ...Array.from(
        { length: 20 },
        (_, index) => `collection-${String(index).padStart(2, "0")}`,
      ),
    );
    await mkdir(candidate, { recursive: true });
    expect(candidate.length).toBeGreaterThan(260);

    await expect(validateWorkspace(candidate)).resolves.toEqual({
      ok: true,
      findings: [],
    });
  });

  it("accepts a removable-volume workspace when its capabilities pass", async () => {
    const mountedCandidate = await temporaryDirectory("removable-volume");

    await expect(validateWorkspace(mountedCandidate)).resolves.toEqual({
      ok: true,
      findings: [],
    });
  });
});

describe("looksLikeWorkspace", () => {
  it("recognizes a folder containing an Earth Stories project", async () => {
    const candidate = await temporaryDirectory("existing-workspace");
    const project = join(candidate, "river-atlas");
    await mkdir(project);
    await writeFile(
      join(project, "story.json"),
      JSON.stringify({
        schema: "earth-stories/project/v1",
        id: "river-atlas",
      }),
    );

    await expect(looksLikeWorkspace(candidate)).resolves.toBe(true);
  });

  it("recognizes a project whose story file needs repair", async () => {
    const candidate = await temporaryDirectory("repair-workspace");
    const project = join(candidate, "river-atlas");
    await mkdir(project);
    await writeFile(join(project, "story.json"), "not valid JSON");

    await expect(looksLikeWorkspace(candidate)).resolves.toBe(true);
  });

  it("does not mistake an empty folder for an existing workspace", async () => {
    const candidate = await temporaryDirectory("empty-workspace");

    await expect(looksLikeWorkspace(candidate)).resolves.toBe(false);
  });
});

async function temporaryDirectory(label = "workspace"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `earth-stories-${label}-`));
  roots.push(root);
  return root;
}

describe("workspace pointer", () => {
  it.each(["null", "[]", '{"workspace": 42}'])(
    "treats the malformed pointer %s as first run without throwing",
    async (contents) => {
      const root = await temporaryDirectory("pointer");
      const pointerFile = join(root, "workspace.json");
      await writeFile(pointerFile, contents);

      await expect(readWorkspacePointer(pointerFile)).resolves.toBeNull();
    },
  );

  it("treats a missing pointer as first run", async () => {
    const root = await temporaryDirectory("missing-pointer");

    await expect(
      readWorkspacePointer(join(root, "workspace.json")),
    ).resolves.toBeNull();
  });

  it("atomically replaces the stored workspace pointer", async () => {
    const root = await temporaryDirectory("write-pointer");
    const pointerFile = join(root, "workspace.json");
    await writeFile(pointerFile, '{"workspace":"/stories/old"}\n');

    await writeWorkspacePointer(pointerFile, "/stories/new");

    await expect(readWorkspacePointer(pointerFile)).resolves.toBe(
      "/stories/new",
    );
    expect(await readdir(root)).toEqual(["workspace.json"]);
  });

  it("preserves the previous pointer when atomic promotion fails", async () => {
    const root = await temporaryDirectory("failed-pointer");
    const pointerFile = join(root, "workspace.json");
    await writeFile(pointerFile, '{"workspace":"/stories/old"}\n');

    await expect(
      writeWorkspacePointer(pointerFile, "/stories/new", {
        rename: async () => {
          throw Object.assign(new Error("rename unavailable"), {
            code: "ENOTSUP",
          });
        },
      }),
    ).rejects.toThrow("rename unavailable");

    await expect(readWorkspacePointer(pointerFile)).resolves.toBe(
      "/stories/old",
    );
    expect(await readdir(root)).toEqual(["workspace.json"]);
  });
});
