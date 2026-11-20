import { mkdtemp, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { acquireChatGPTLease, chatGPTLeasePort } from "./lease.js";
it("prevents concurrent token owners and releases only its own lease", async () => {
  const root = await mkdtemp(join(tmpdir(), "chatgpt-lease-"));
  const path = join(root, "session.lock");
  try {
    const release = await acquireChatGPTLease(path);
    await expect(acquireChatGPTLease(path)).rejects.toThrow(/another/i);
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

it("ignores legacy locks with a reused live PID and an abandoned recovery marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "chatgpt-old-"));
  const path = join(root, "session.lock");
  try {
    await writeFile(path, JSON.stringify({ pid: process.ppid, id: "old" }));
    await writeFile(path + ".recovery", "");
    const release = await acquireChatGPTLease(path);
    await release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("the kernel releases ownership after a process is killed", async () => {
  const root = await mkdtemp(join(tmpdir(), "chatgpt-crash-"));
  const path = join(root, "session.lock");
  const child = spawn(
    process.execPath,
    [
      "-e",
      `require('node:net').createServer().listen({host:'127.0.0.1',port:${await chatGPTLeasePort(path)},exclusive:true},()=>process.stdout.write('ready'))`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    await once(child.stdout!, "data");
    await expect(acquireChatGPTLease(path)).rejects.toThrow(/another/i);
    const stopped = once(child, "exit");
    child.kill("SIGKILL");
    await stopped;
    const release = await acquireChatGPTLease(path);
    await release();
  } finally {
    child.kill();
    await rm(root, { recursive: true, force: true });
  }
});

it("uses one lease for symlink aliases of the same credential directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "chatgpt-alias-"));
  const alias = root + "-alias";
  try {
    await symlink(root, alias, "junction");
    const release = await acquireChatGPTLease(join(root, "session.lock"));
    try {
      await expect(
        acquireChatGPTLease(join(alias, "session.lock")),
      ).rejects.toThrow(/another/i);
    } finally {
      await release();
    }
  } finally {
    await rm(alias, { force: true });
    await rm(root, { recursive: true, force: true });
  }
});
