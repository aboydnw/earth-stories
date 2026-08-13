import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLaunchWorkspace } from "./firstRun.js";
import { readWorkspacePointer } from "./workspace.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function root() {
  const value = await mkdtemp(join(tmpdir(), "earth-stories-first-run-"));
  roots.push(value);
  return value;
}

describe("resolveLaunchWorkspace", () => {
  it("uses a valid stored workspace without presenting first run", async () => {
    const directory = await root();
    const workspace = join(directory, "stories");
    const pointerFile = join(directory, "workspace.json");
    await mkdir(workspace);
    const choose = vi.fn();

    await expect(
      resolveLaunchWorkspace({
        pointerFile,
        defaultPath: join(directory, "default"),
        readPointer: async () => workspace,
        writePointer: vi.fn(),
        choose,
        confirm: vi.fn(),
        reportInvalid: vi.fn(),
      }),
    ).resolves.toBe(workspace);
    expect(choose).not.toHaveBeenCalled();
  });

  it("shows the default path and creates it only after confirmation", async () => {
    const directory = await root();
    const workspace = join(directory, "Earth Stories");
    const pointerFile = join(directory, "workspace.json");
    const events: string[] = [];

    await expect(
      resolveLaunchWorkspace({
        pointerFile,
        defaultPath: workspace,
        choose: async (defaultPath) => {
          events.push(`choose:${defaultPath}`);
          return { kind: "default" };
        },
        confirm: async (details) => {
          events.push(`confirm:${details.path}:${details.willCreate}`);
          expect(await readdir(directory)).toEqual([]);
          return true;
        },
        reportInvalid: vi.fn(),
      }),
    ).resolves.toBe(workspace);
    expect(events).toEqual([
      `choose:${workspace}`,
      `confirm:${workspace}:true`,
    ]);
    expect(await readdir(directory)).toEqual([
      "Earth Stories",
      "workspace.json",
    ]);
    await expect(readWorkspacePointer(pointerFile)).resolves.toBe(workspace);
  });

  it("leaves a declined first-run workspace absent and unpersisted", async () => {
    const directory = await root();
    const workspace = join(directory, "Earth Stories");
    const pointerFile = join(directory, "workspace.json");

    await expect(
      resolveLaunchWorkspace({
        pointerFile,
        defaultPath: workspace,
        choose: async () => ({ kind: "default" }),
        confirm: async () => false,
        reportInvalid: vi.fn(),
      }),
    ).resolves.toBeNull();
    expect(await readdir(directory)).toEqual([]);
  });

  it("accepts an empty selected folder with honest confirmation messaging", async () => {
    const directory = await root();
    const workspace = join(directory, "empty");
    await mkdir(workspace);
    const confirm = vi.fn(async () => true);

    await expect(
      resolveLaunchWorkspace({
        pointerFile: join(directory, "workspace.json"),
        defaultPath: join(directory, "default"),
        choose: async () => ({ kind: "existing", path: workspace }),
        confirm,
        reportInvalid: vi.fn(),
      }),
    ).resolves.toBe(workspace);
    expect(confirm).toHaveBeenCalledWith({
      kind: "existing",
      path: workspace,
      willCreate: false,
      containsProjects: false,
    });
  });
});
