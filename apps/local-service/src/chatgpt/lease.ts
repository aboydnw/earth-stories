import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, lstat } from "node:fs/promises";
import { dirname } from "node:path";
/** A process-wide lease prevents separate services racing rotating refresh tokens. */
export async function acquireChatGPTLease(
  path: string,
): Promise<() => Promise<void>> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const owner = { pid: process.pid, id: randomUUID() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(owner));
        await file.sync();
      } finally {
        await file.close();
      }
      return async () => {
        try {
          const saved = JSON.parse(await readFile(path, "utf8"));
          if (saved.id === owner.id) await rm(path);
        } catch {
          /* Another process must never lose its lease. */
        }
      };
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
      let recovery;
      try {
        // Serialize stale-owner recovery, including the ownership recheck.
        recovery = await open(`${path}.recovery`, "wx", 0o600);
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error();
        const saved = JSON.parse(await readFile(path, "utf8"));
        if (!Number.isSafeInteger(saved.pid) || saved.pid <= 0)
          throw new Error();
        try {
          process.kill(saved.pid, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") {
            await rm(path);
            continue;
          }
          throw error;
        }
      } catch {
        /* Fail closed for unknown ownership. */
      } finally {
        if (recovery) {
          await recovery.close();
          await rm(`${path}.recovery`, { force: true });
        }
      }
      throw new Error(
        "Another Earth Stories service owns ChatGPT sign-in. Close it before starting this service.",
      );
    }
  }
  throw new Error("ChatGPT sign-in could not acquire its local session lock.");
}
