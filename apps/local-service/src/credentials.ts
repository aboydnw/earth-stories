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
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as {
        token?: unknown;
        login?: unknown;
      };
      if (typeof parsed.token !== "string" || !parsed.token) return null;
      if (typeof parsed.login !== "string" || !parsed.login) return null;
      return { token: parsed.token, login: parsed.login };
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
