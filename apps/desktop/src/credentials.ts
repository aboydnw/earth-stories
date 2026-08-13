import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  FileCredentialStore,
  type CredentialStore,
  type StoredCredentials,
} from "@earth-stories/local-service";

export interface SafeStorageBoundary {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface CredentialPromotionOperations {
  securePromotedFile(path: string): Promise<void>;
  syncPromotedDirectory(path: string): Promise<void>;
}

const defaultPromotionOperations: CredentialPromotionOperations = {
  securePromotedFile: async (path) => chmod(path, 0o600),
  syncPromotedDirectory: syncDirectory,
};

interface EncryptedCredentialRecord {
  version: 1;
  login: string;
  encryptedToken: string;
}

type ParsedRecord =
  | { kind: "encrypted"; value: EncryptedCredentialRecord }
  | { kind: "plaintext"; value: StoredCredentials }
  | { kind: "malformed" };

function parseRecord(serialized: string): ParsedRecord {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return { kind: "malformed" };
  }
  if (!value || typeof value !== "object") return { kind: "malformed" };
  const record = value as Record<string, unknown>;
  if (record.version === 1) {
    if (
      typeof record.login !== "string" ||
      !record.login ||
      typeof record.encryptedToken !== "string" ||
      !record.encryptedToken
    )
      return { kind: "malformed" };
    return {
      kind: "encrypted",
      value: {
        version: 1,
        login: record.login,
        encryptedToken: record.encryptedToken,
      },
    };
  }
  if (
    typeof record.token === "string" &&
    record.token &&
    typeof record.login === "string" &&
    record.login
  )
    return {
      kind: "plaintext",
      value: { token: record.token, login: record.login },
    };
  return { kind: "malformed" };
}

function decodeEncryptedToken(value: string): Buffer | null {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    return null;
  const decoded = Buffer.from(value, "base64");
  return decoded.length > 0 && decoded.toString("base64") === value
    ? decoded
    : null;
}

async function syncDirectory(path: string): Promise<void> {
  let directory;
  try {
    directory = await open(path, "r");
    await directory.sync();
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (process.platform !== "win32" || (code !== "EINVAL" && code !== "EPERM"))
      throw cause;
  } finally {
    await directory?.close();
  }
}

export class SafeStorageCredentialStore implements CredentialStore {
  readonly path: string;
  readonly #safeStorage: SafeStorageBoundary;
  readonly #fallback: FileCredentialStore;
  readonly #promotion: CredentialPromotionOperations;
  readonly #reported = new Set<string>();

  constructor(
    path: string,
    safeStorage: SafeStorageBoundary,
    promotion: Partial<CredentialPromotionOperations> = {},
  ) {
    this.path = path;
    this.#safeStorage = safeStorage;
    this.#fallback = new FileCredentialStore(path);
    this.#promotion = { ...defaultPromotionOperations, ...promotion };
  }

  async read(): Promise<StoredCredentials | null> {
    let serialized: string;
    try {
      serialized = await readFile(this.path, "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
      this.#diagnose("read", "Stored credentials could not be read.");
      return null;
    }

    const record = parseRecord(serialized);
    if (record.kind === "malformed") {
      this.#diagnose(
        "malformed",
        "Stored credentials are malformed and were ignored.",
      );
      return null;
    }
    if (record.kind === "encrypted") return this.#decrypt(record.value);
    if (!this.#safeStorage.isEncryptionAvailable()) {
      this.#reportFallback();
      return record.value;
    }

    try {
      await this.#writeEncrypted(record.value, serialized);
    } catch {
      throw new Error(
        "Earth Stories credential protection failed; readable plaintext credentials remain recoverable.",
      );
    }
    return record.value;
  }

  async write(value: StoredCredentials): Promise<void> {
    if (this.#safeStorage.isEncryptionAvailable()) {
      try {
        await this.#writeEncrypted(value);
      } catch {
        throw new Error("Earth Stories credential protection failed.");
      }
      return;
    }

    if (await this.#containsProtectedRecord()) {
      this.#diagnose(
        "encrypted-unavailable",
        "OS credential encryption is unavailable; stored encrypted credentials cannot be replaced.",
      );
      throw new Error(
        "Stored encrypted credentials cannot be replaced while credential encryption is unavailable.",
      );
    }
    this.#reportFallback();
    await this.#fallback.write(value);
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.#fallback.clear(),
      rm(this.#recoveryPath(), { force: true }),
    ]);
  }

  #decrypt(record: EncryptedCredentialRecord): StoredCredentials | null {
    if (!this.#safeStorage.isEncryptionAvailable()) {
      this.#diagnose(
        "encrypted-unavailable",
        "OS credential encryption is unavailable; stored encrypted credentials cannot be read.",
      );
      return null;
    }
    const encrypted = decodeEncryptedToken(record.encryptedToken);
    if (!encrypted) {
      this.#diagnose(
        "malformed",
        "Stored credentials are malformed and were ignored.",
      );
      return null;
    }
    try {
      const token = this.#safeStorage.decryptString(encrypted);
      return token ? { token, login: record.login } : null;
    } catch {
      this.#diagnose(
        "decrypt",
        "Stored encrypted credentials could not be decrypted and were ignored.",
      );
      return null;
    }
  }

  async #writeEncrypted(
    value: StoredCredentials,
    recoveryPlaintext?: string,
  ): Promise<void> {
    const encryptedToken = this.#safeStorage
      .encryptString(value.token)
      .toString("base64");
    const record: EncryptedCredentialRecord = {
      version: 1,
      login: value.login,
      encryptedToken,
    };
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporary = join(directory, `.credentials-${randomUUID()}.tmp`);
    const recovery = this.#recoveryPath();
    let file;
    let recoveryPrepared = false;
    let promoted = false;
    let restored = false;
    try {
      file = await open(temporary, "wx", 0o600);
      await file.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
      await file.sync();
      await file.close();
      file = undefined;
      if (recoveryPlaintext !== undefined) {
        await this.#writeRecovery(recoveryPlaintext, directory);
        recoveryPrepared = true;
      }
      await rename(temporary, this.path);
      promoted = true;
      await this.#promotion.securePromotedFile(this.path);
      await this.#promotion.syncPromotedDirectory(directory);
    } catch (cause) {
      if (promoted && recoveryPrepared) {
        try {
          await rename(recovery, this.path);
          restored = true;
          await syncDirectory(directory);
        } catch {
          // If restoration cannot finish, retain whichever recovery artifact
          // still exists rather than deleting the only readable plaintext.
        }
      }
      throw cause;
    } finally {
      await file?.close().catch(() => undefined);
      await rm(temporary, { force: true });
      if (recoveryPrepared && (!promoted || restored))
        await rm(recovery, { force: true });
    }
    if (recoveryPrepared) await rm(recovery, { force: true });
  }

  async #writeRecovery(serialized: string, directory: string): Promise<void> {
    const temporary = join(
      directory,
      `.credentials-recovery-${randomUUID()}.tmp`,
    );
    let file;
    try {
      file = await open(temporary, "wx", 0o600);
      await file.writeFile(serialized, "utf8");
      await file.sync();
      await file.close();
      file = undefined;
      await rename(temporary, this.#recoveryPath());
      await syncDirectory(directory);
    } finally {
      await file?.close().catch(() => undefined);
      await rm(temporary, { force: true });
    }
  }

  #recoveryPath(): string {
    return `${this.path}.plaintext-recovery`;
  }

  async #containsProtectedRecord(): Promise<boolean> {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8")) as unknown;
      return Boolean(
        value &&
        typeof value === "object" &&
        Object.prototype.hasOwnProperty.call(value, "version"),
      );
    } catch {
      return false;
    }
  }

  #reportFallback(): void {
    this.#diagnose(
      "fallback",
      "OS credential encryption is unavailable; Earth Stories is using a mode-0600 plaintext fallback for sign-in credentials.",
    );
  }

  #diagnose(key: string, message: string): void {
    if (this.#reported.has(key)) return;
    this.#reported.add(key);
    console.warn(message);
  }
}

export function createSafeStorageCredentialStoreFactory(
  safeStorage: SafeStorageBoundary,
): (path: string) => CredentialStore {
  return (path) => new SafeStorageCredentialStore(path, safeStorage);
}
