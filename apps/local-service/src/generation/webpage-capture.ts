import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authorizedFetch, validateRemoteUrl } from "@earth-stories/publisher";

class PageConnection {
  private next = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  onRequest: (params: any) => void = () => {};
  constructor(readonly socket: WebSocket) {
    socket.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id) {
        const p = this.pending.get(m.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(m.id);
          if (m.error) p.reject(new Error("Reference browser command failed"));
          else p.resolve(m.result);
        }
      } else if (m.method === "Fetch.requestPaused") this.onRequest(m.params);
    });
    socket.addEventListener("close", () => this.close());
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Reference browser timed out"));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error("Reference browser closed"));
      }
    });
  }
  close() {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Reference browser closed"));
    }
    this.pending.clear();
    if (this.socket.readyState < 2) this.socket.close();
  }
}
export async function readReferenceBody(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error("Reference resource too large");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty reference resource");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const r = await reader.read();
      signal.throwIfAborted();
      if (r.done) break;
      bytes += r.value.length;
      if (bytes > limit) throw new Error("Reference resource too large");
      chunks.push(r.value);
    }
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
/** Browser networking is denied by a dead proxy. Only bounded, DNS-pinned service fetches supply resources. */
export async function captureReferencePage(
  url: string,
  html: string,
  callerSignal: AbortSignal,
): Promise<{ image: string; partial: boolean }> {
  if (validateRemoteUrl(url).protocol !== "https:")
    throw new Error("References require HTTPS.");
  const lifetime = new AbortController();
  const signal = AbortSignal.any([
    callerSignal,
    lifetime.signal,
    AbortSignal.timeout(15000),
  ]);
  signal.throwIfAborted();
  const executable =
    process.env.CHROME_PATH ??
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "/usr/bin/google-chrome");
  await access(executable);
  const profile = await mkdtemp(join(tmpdir(), "earth-reference-"));
  let child: ChildProcess | undefined, client: PageConnection | undefined;
  const stop = () => {
    client?.close();
    child?.kill("SIGTERM");
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    child = spawn(
      executable,
      [
        "--headless=new",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-extensions",
        "--disable-sync",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-port=0",
        "--proxy-server=http://127.0.0.1:9",
        "--proxy-bypass-list=<-loopback>",
        "--host-resolver-rules=MAP * ~NOTFOUND",
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    let startError = false;
    child.on("error", () => {
      startError = true;
    });
    let port = "";
    while (!port) {
      signal.throwIfAborted();
      if (startError || child.exitCode !== null)
        throw new Error("Reference browser unavailable");
      try {
        port = (
          await readFile(join(profile, "DevToolsActivePort"), "utf8")
        ).split("\n")[0]!;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    const page = (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: "PUT",
      signal,
    }).then((r) => r.json())) as { webSocketDebuggerUrl: string };
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Reference browser unavailable")),
        { once: true },
      );
      const abort = () => {
        socket.close();
        reject(new Error("Reference capture cancelled"));
      };
      signal.addEventListener("abort", abort, { once: true });
      socket.addEventListener(
        "open",
        () => signal.removeEventListener("abort", abort),
        { once: true },
      );
      if (signal.aborted) abort();
    });
    client = new PageConnection(socket);
    const cdp = client;
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1200,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send("Browser.setDownloadBehavior", { behavior: "deny" });
    let documentSent = false,
      requests = 0,
      bytes = 0,
      partial = false;
    const pending = new Set<Promise<void>>();
    let resources = Promise.resolve();
    cdp.onRequest = (params) => {
      const work = (async () => {
        try {
          signal.throwIfAborted();
          let body: Buffer, type: string;
          if (
            !documentSent &&
            params.resourceType === "Document" &&
            params.request.url === url
          ) {
            documentSent = true;
            body = Buffer.from(html);
            type = "text/html; charset=utf-8";
          } else {
            if (
              !["Stylesheet", "Image", "Font"].includes(params.resourceType) ||
              ++requests > 40
            )
              throw new Error("Resource not allowed");
            // Serialize reads so simultaneous resources cannot overspend the shared byte budget.
            const previous = resources;
            let release!: () => void;
            resources = new Promise<void>((resolve) => {
              release = resolve;
            });
            await previous;
            try {
              signal.throwIfAborted();
              if (bytes >= 10 * 1024 * 1024)
                throw new Error("Resource budget exceeded");
              const response = await authorizedFetch(
                params.request.url,
                { signal },
                { httpsOnly: true, maxRedirects: 3 },
              );
              if (!response.ok) {
                await response.body?.cancel();
                throw new Error("Resource unavailable");
              }
              const allowance = Math.min(
                2 * 1024 * 1024,
                10 * 1024 * 1024 - bytes,
              );
              // Failed or oversized reads still consume their reservation.
              bytes += allowance;
              body = await readReferenceBody(response, allowance, signal);
              bytes -= allowance - body.length;
              type =
                response.headers.get("content-type") ??
                "application/octet-stream";
              if (
                params.resourceType === "Stylesheet" &&
                !type.startsWith("text/css")
              )
                throw new Error("Invalid stylesheet");
              if (params.resourceType === "Image" && !type.startsWith("image/"))
                throw new Error("Invalid image");
            } finally {
              release();
            }
          }
          await cdp.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 200,
            responseHeaders: [
              { name: "Content-Type", value: type },
              {
                name: "Content-Security-Policy",
                value:
                  "script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
              },
              { name: "Cache-Control", value: "no-store" },
            ],
            body: body.toString("base64"),
          });
        } catch {
          partial = true;
          await cdp
            .send("Fetch.failRequest", {
              requestId: params.requestId,
              errorReason: "BlockedByClient",
            })
            .catch(() => {});
        }
      })();
      pending.add(work);
      void work.finally(() => pending.delete(work));
    };
    await cdp.send("Fetch.enable", {
      patterns: [{ urlPattern: "*", requestStage: "Request" }],
    });
    await cdp.send("Page.navigate", { url });
    // Wait for document/resources with a bounded settle period; animation/scripts are intentionally disabled.
    for (let i = 0; i < 40; i++) {
      signal.throwIfAborted();
      await new Promise((r) => setTimeout(r, 100));
      if (documentSent && !pending.size && i > 5) break;
    }
    signal.throwIfAborted();
    if (!documentSent) throw new Error("Reference page not loaded");
    if (pending.size) partial = true;
    const result = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    if (typeof result.data !== "string" || result.data.length > 8 * 1024 * 1024)
      throw new Error("Reference capture too large");
    return { image: result.data, partial };
  } finally {
    lifetime.abort();
    signal.removeEventListener("abort", stop);
    stop();
    if (child && child.exitCode === null)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child?.kill("SIGKILL");
          resolve();
        }, 1000);
        child!.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    }).catch(() => {});
  }
}
