import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createSafeStorageCredentialStoreFactory,
  SafeStorageCredentialStore,
  type SafeStorageBoundary,
} from "./credentials.js";

function safeStorage(available = true): SafeStorageBoundary {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`sealed:${value}`, "utf8"),
    decryptString: (value) => {
      const encoded = value.toString("utf8");
      if (!encoded.startsWith("sealed:"))
        throw new Error("keyring rejected data");
      return encoded.slice("sealed:".length);
    },
  };
}

async function fixture(storage = safeStorage()) {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-safe-storage-"));
  const path = join(root, "private", "credentials.json");
  await mkdir(dirname(path), { recursive: true });
  return { path, store: new SafeStorageCredentialStore(path, storage) };
}

describe("SafeStorageCredentialStore", () => {
  it("creates desktop stores bound to Electron safeStorage", async () => {
    const storage = safeStorage();
    const root = await mkdtemp(
      join(tmpdir(), "earth-stories-safe-storage-wiring-"),
    );
    const path = join(root, "credentials.json");
    const store = createSafeStorageCredentialStoreFactory(storage)(path);

    await store.write({ token: "desktop-secret", login: "mapper" });

    await expect(store.read()).resolves.toEqual({
      token: "desktop-secret",
      login: "mapper",
    });
    expect(await readFile(path, "utf8")).not.toContain("desktop-secret");
  });

  it("round-trips through safeStorage without persisting the token", async () => {
    const { path, store } = await fixture();

    await store.write({ token: "github-secret", login: "mapper" });

    await expect(store.read()).resolves.toEqual({
      token: "github-secret",
      login: "mapper",
    });
    const persisted = await readFile(path, "utf8");
    expect(persisted).not.toContain("github-secret");
    expect(JSON.parse(persisted)).toEqual({
      version: 1,
      login: "mapper",
      encryptedToken: Buffer.from("sealed:github-secret").toString("base64"),
    });
    if (platform() !== "win32") {
      expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
  });

  it("migrates a readable plaintext record on first read", async () => {
    const { path, store } = await fixture();
    await writeFile(path, '{"token":"legacy-secret","login":"mapper"}');

    await expect(store.read()).resolves.toEqual({
      token: "legacy-secret",
      login: "mapper",
    });

    const persisted = await readFile(path, "utf8");
    expect(persisted).not.toContain("legacy-secret");
    expect(JSON.parse(persisted)).toEqual({
      version: 1,
      login: "mapper",
      encryptedToken: Buffer.from("sealed:legacy-secret").toString("base64"),
    });
  });

  it("preserves readable plaintext when migration cannot encrypt", async () => {
    const storage = safeStorage();
    storage.encryptString = () => {
      throw new Error("keyring write failed");
    };
    const { path, store } = await fixture(storage);
    const plaintext = '{"token":"legacy-secret","login":"mapper"}';
    await writeFile(path, plaintext);

    await expect(store.read()).rejects.toThrow("credential protection failed");
    await expect(readFile(path, "utf8")).resolves.toBe(plaintext);
  });

  it("falls back to the private plaintext file once per instance without a keyring", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { path, store } = await fixture(safeStorage(false));

    await store.write({ token: "fallback-secret", login: "mapper" });
    await expect(store.read()).resolves.toEqual({
      token: "fallback-secret",
      login: "mapper",
    });

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      token: "fallback-secret",
      login: "mapper",
    });
    if (platform() !== "win32") {
      expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0]?.[0]).toMatch(/plaintext fallback/i);
    warning.mockRestore();
  });

  it("returns null for malformed or undecryptable records without leaking token data", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { path, store } = await fixture();
    await writeFile(
      path,
      '{"version":1,"login":"mapper","encryptedToken":"%%%"}',
    );
    await expect(store.read()).resolves.toBeNull();

    await writeFile(
      path,
      `${JSON.stringify({ version: 1, login: "mapper", encryptedToken: Buffer.from("not-sealed").toString("base64") })}\n`,
    );
    await expect(store.read()).resolves.toBeNull();

    await writeFile(path, '{"token":"do-not-log","login":false}');
    await expect(store.read()).resolves.toBeNull();
    expect(warning.mock.calls.flat().join(" ")).not.toContain("do-not-log");
    warning.mockRestore();
  });

  it("never replaces an encrypted record with plaintext when the keyring becomes unavailable", async () => {
    let available = true;
    const storage = safeStorage();
    storage.isEncryptionAvailable = () => available;
    const { path, store } = await fixture(storage);
    await store.write({ token: "encrypted-secret", login: "mapper" });
    const encrypted = await readFile(path, "utf8");
    available = false;

    await expect(store.read()).resolves.toBeNull();
    await expect(
      store.write({ token: "replacement-secret", login: "mapper" }),
    ).rejects.toThrow(/encrypted credentials/i);
    await expect(readFile(path, "utf8")).resolves.toBe(encrypted);
  });

  it("clears the active credentials artifact", async () => {
    const { path, store } = await fixture();
    await store.write({ token: "secret", login: "mapper" });

    await store.clear();

    await expect(store.read()).resolves.toBeNull();
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
