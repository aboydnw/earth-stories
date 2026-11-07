import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export interface StoredCredentials {
  token: string;
  login: string;
  expiresAt?: number;
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
  accountId?: number;
  appClientId?: string;
  brokerOrigin?: string;
}

/** Validate persisted metadata without silently dropping malformed rotation state. */
export function parseStoredCredentials(
  value: unknown,
): StoredCredentials | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.token !== "string" ||
    !data.token ||
    typeof data.login !== "string" ||
    !data.login
  )
    return null;
  for (const field of [
    "expiresAt",
    "refreshTokenExpiresAt",
    "accountId",
  ] as const) {
    if (
      data[field] !== undefined &&
      (!Number.isSafeInteger(data[field]) || (data[field] as number) <= 0)
    )
      return null;
  }
  const refreshFields = [
    "refreshToken",
    "refreshTokenExpiresAt",
    "accountId",
    "appClientId",
    "brokerOrigin",
  ];
  if (refreshFields.some((field) => data[field] !== undefined)) {
    if (
      refreshFields.some((field) => data[field] === undefined) ||
      data.expiresAt === undefined ||
      typeof data.refreshToken !== "string" ||
      !/^ghr_[A-Za-z0-9_]{1,500}$/.test(data.refreshToken) ||
      typeof data.appClientId !== "string" ||
      !/^[A-Za-z0-9_.-]{1,200}$/.test(data.appClientId) ||
      typeof data.brokerOrigin !== "string"
    )
      return null;
    try {
      const url = new URL(data.brokerOrigin);
      if (url.protocol !== "https:" || url.origin !== data.brokerOrigin)
        return null;
    } catch {
      return null;
    }
  }
  return {
    token: data.token,
    login: data.login,
    ...(data.expiresAt !== undefined
      ? { expiresAt: data.expiresAt as number }
      : {}),
    ...(data.refreshToken !== undefined
      ? {
          refreshToken: data.refreshToken as string,
          refreshTokenExpiresAt: data.refreshTokenExpiresAt as number,
          accountId: data.accountId as number,
          appClientId: data.appClientId as string,
          brokerOrigin: data.brokerOrigin as string,
        }
      : {}),
  };
}

export interface CredentialStore {
  read(): Promise<StoredCredentials | null>;
  write(value: StoredCredentials): Promise<void>;
  clear(): Promise<void>;
}

export function credentialsPath(homeDirectory = homedir()): string {
  return join(homeDirectory, ".earth-stories", "credentials.json");
}

export class FileCredentialStore implements CredentialStore {
  readonly path: string;

  constructor(path = credentialsPath()) {
    this.path = path;
  }

  async read(): Promise<StoredCredentials | null> {
    try {
      return parseStoredCredentials(
        JSON.parse(await readFile(this.path, "utf8")),
      );
    } catch {
      return null;
    }
  }

  async write(value: StoredCredentials): Promise<void> {
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporary = join(directory, `.credentials-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, this.path);
      await chmod(this.path, 0o600);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}
