import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileCredentialStore, credentialsPath } from "./credentials.js";

async function fixture(): Promise<{
  path: string;
  store: FileCredentialStore;
}> {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-credentials-"));
  const path = join(root, "private", "credentials.json");
  return { path, store: new FileCredentialStore(path) };
}

describe("FileCredentialStore", () => {
  it("round-trips credentials with private directory and file modes", async () => {
    const { path, store } = await fixture();

    await store.write({ token: "secret", login: "mapper" });

    await expect(store.read()).resolves.toEqual({
      token: "secret",
      login: "mapper",
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      token: "secret",
      login: "mapper",
    });
    if (platform() !== "win32") {
      expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
  });

  it("clears stored credentials", async () => {
    const { path, store } = await fixture();
    await store.write({ token: "secret", login: "mapper" });

    await store.clear();

    await expect(store.read()).resolves.toBeNull();
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns null for missing, malformed, and partial records", async () => {
    const { path, store } = await fixture();
    await expect(store.read()).resolves.toBeNull();
    await store.write({ token: "secret", login: "mapper" });

    for (const value of [
      "not json",
      '{"token":"secret"}',
      '{"login":"mapper"}',
    ]) {
      await writeFile(path, value);
      await expect(store.read()).resolves.toBeNull();
    }
  });

  it("keeps the troubleshooting path under the requested home directory", () => {
    expect(credentialsPath("/users/mapper")).toBe(
      join("/users/mapper", ".earth-stories", "credentials.json"),
    );
  });
});
