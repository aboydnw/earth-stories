import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { acquireChatGPTLease } from "./lease.js";
it("prevents concurrent token owners and releases only its own lease", async () => {
  const root = await mkdtemp(join(tmpdir(), "chatgpt-lease-"));
  const path = join(root, "session.lock");
  try {
    const release = await acquireChatGPTLease(path);
    await expect(acquireChatGPTLease(path)).rejects.toThrow(/Another/);
    await writeFile(
      path,
      JSON.stringify({ pid: process.pid, id: "replacement" }),
    );
    await release();
    expect(JSON.parse(await readFile(path, "utf8")).id).toBe("replacement");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("allows only one recovery owner for a dead process lease", async () => {
  const root = await mkdtemp(join(tmpdir(), "chatgpt-lease-dead-"));
  const path = join(root, "session.lock");
  try {
    await writeFile(path, JSON.stringify({ pid: 2147483647, id: "dead" }));
    const attempts = await Promise.allSettled([
      acquireChatGPTLease(path),
      acquireChatGPTLease(path),
    ]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of attempts)
      if (result.status === "fulfilled") await result.value();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
