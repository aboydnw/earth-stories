import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { resolve, dirname, basename, join } from "node:path";
import { mkdir, realpath } from "node:fs/promises";

/** A kernel-owned loopback listener releases on exit, including SIGKILL/reboot.
 * No protocol or credentials are served. A port collision disables only ChatGPT;
 * never fall back to another port, which could allow concurrent token owners.
 * The legacy lock path is now only a stable session identifier; files are ignored.
 */
export async function chatGPTLeasePort(path: string): Promise<number> {
  const parent = dirname(resolve(path));
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const canonical = join(await realpath(parent), basename(path));
  return (
    20000 +
    (createHash("sha256")
      .update(
        process.platform === "win32" ? canonical.toLowerCase() : canonical,
      )
      .digest()
      .readUInt32BE(0) %
      40000)
  );
}
export async function acquireChatGPTLease(
  path: string,
): Promise<() => Promise<void>> {
  const port = await chatGPTLeasePort(path);
  const server = createServer((socket) => socket.destroy());
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch {
    throw new Error(
      "ChatGPT connection is unavailable or owned by another Earth Stories service. Close the other service and try signing in again. Project editing and publishing remain available.",
    );
  }
  server.unref();
  let closing: Promise<void> | undefined;
  return () =>
    (closing ??= new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ));
}
