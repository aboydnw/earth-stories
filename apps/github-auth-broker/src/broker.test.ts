import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { CALLBACK_URL, createBroker, readConfig, TOKEN_URL } from "./broker.js";
import { createNodeHandler } from "./node-handler.js";
import * as deployment from "../api/github/exchange.js";

const config = { clientId: "Iv1.test", clientSecret: "server_secret" };
const valid = { code: "code123", codeVerifier: "a".repeat(43) };
const request = (body: unknown = valid, headers: Record<string, string> = {}) =>
  new Request("https://broker.test/api/github/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const success = () =>
  new Response(
    JSON.stringify({
      access_token: "ghu_test",
      token_type: "bearer",
      expires_in: 28800,
      secret: "do_not_reflect",
    }),
  );

describe("GitHub App broker", () => {
  it("uses Vercel Web exports without legacy body parsing and preserves method checks", async () => {
    expect(Object.keys(deployment).sort()).toEqual([
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
    ]);
    const result = await deployment.GET(
      new Request("https://broker.test/api/github/exchange"),
    );
    expect(result.status).toBe(405);
    expect(result.headers.get("allow")).toBe("POST");
  });
  it("validates config and exposes only safe health", async () => {
    expect(readConfig({})).toBeUndefined();
    expect(
      readConfig({
        GITHUB_APP_CLIENT_ID: "bad\n",
        GITHUB_APP_CLIENT_SECRET: "ok",
      }),
    ).toBeUndefined();
    expect(
      readConfig({
        GITHUB_APP_CLIENT_ID: config.clientId,
        GITHUB_APP_CLIENT_SECRET: config.clientSecret,
      }),
    ).toEqual(config);
    expect((await createBroker(undefined)(request())).status).toBe(503);
    const health = await createBroker(config)(
      new Request("https://broker.test/health"),
    );
    expect(await health.json()).toEqual({ status: "ok" });
  });
  it("uses fixed endpoints and PKCE parameters, strips everything but token and expiry", async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(success());
    const result = await createBroker(config, { fetch: upstream })(request());
    expect(await result.json()).toEqual({
      accessToken: "ghu_test",
      expiresIn: 28800,
    });
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    const [url, options] = upstream.mock.calls[0];
    expect(url).toBe(TOKEN_URL);
    expect(options?.redirect).toBe("error");
    expect(Object.fromEntries(options?.body as URLSearchParams)).toEqual({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: valid.code,
      code_verifier: valid.codeVerifier,
      redirect_uri: CALLBACK_URL,
    });
  });
  it.each([
    null,
    [],
    {},
    { ...valid, redirect_uri: "https://evil.test" },
    { ...valid, client_id: "other" },
    { ...valid, codeVerifier: "x".repeat(42) },
    { ...valid, codeVerifier: "x".repeat(129) },
    { ...valid, codeVerifier: "+".repeat(43) },
    { ...valid, code: "a\nb" },
    { ...valid, code: "x".repeat(513) },
  ])("rejects malformed and injected inputs: %j", async (body) => {
    const upstream = vi.fn<typeof fetch>();
    const result = await createBroker(config, { fetch: upstream })(
      request(body),
    );
    expect(result.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
    expect(await result.text()).toBe('{"error":"Invalid request"}');
  });
  it("rejects invalid JSON, oversized/chunked bodies, wrong content types and compression", async () => {
    const broker = createBroker(config);
    expect(
      (
        await broker(
          new Request("https://broker.test/api/github/exchange", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect((await broker(request("x".repeat(5000)))).status).toBe(400);
    expect(
      (await broker(request(valid, { "content-length": "99999" }))).status,
    ).toBe(413);
    expect(
      (await broker(request(valid, { "content-length": "no" }))).status,
    ).toBe(413);
    expect(
      (await broker(request(valid, { "content-type": "text/plain" }))).status,
    ).toBe(415);
    expect(
      (await broker(request(valid, { "content-encoding": "gzip" }))).status,
    ).toBe(415);
  });
  it.each([
    { origin: "https://evil.test" },
    { origin: "null" },
    { "sec-fetch-site": "same-origin" },
  ])("rejects browser requests without CORS: %j", async (headers) => {
    const result = await createBroker(config)(
      request(
        valid,
        Object.fromEntries(
          Object.entries(headers).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
      ),
    );
    expect(result.status).toBe(403);
    expect(result.headers.has("access-control-allow-origin")).toBe(false);
  });
  it("rejects wrong methods and paths", async () => {
    const broker = createBroker(config);
    for (const method of ["GET", "PUT", "DELETE", "OPTIONS", "HEAD"]) {
      const result = await broker(
        new Request("https://broker.test/api/github/exchange", { method }),
      );
      expect(result.status).toBe(405);
      expect(result.headers.get("allow")).toBe("POST");
    }
    for (const path of [
      "/",
      "/api/github/exchange/",
      "/api/github/exchange?url=evil",
      "/health?secret=please",
    ]) {
      expect(
        (await broker(new Request(`https://broker.test${path}`))).status,
      ).toBe(404);
    }
    expect(
      (
        await broker(
          new Request("https://broker.test/health", { method: "POST" }),
        )
      ).status,
    ).toBe(405);
  });
  it.each([
    { access_token: "ghu_test", token_type: "bearer", error: "secret" },
    { access_token: "ghu_test", token_type: "other" },
    { access_token: "bad\ntoken", token_type: "bearer" },
    { access_token: "ghu_test", token_type: "bearer", expires_in: -1 },
    { access_token: "ghu_test", token_type: "bearer", expires_in: "300" },
    null,
    [],
    { refresh_token: "secret" },
  ])("sanitizes invalid upstream response: %j", async (data) => {
    const result = await createBroker(config, {
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(data))),
    })(request());
    expect(result.status).toBe(502);
    expect(await result.text()).toBe(
      '{"error":"GitHub authorization could not be completed"}',
    );
  });
  it("supports a token without expiry and never reflects upstream errors", async () => {
    const broker = createBroker(config, {
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ access_token: "ghu_test", token_type: "bearer" }),
          ),
        ),
    });
    expect(await (await broker(request())).json()).toEqual({
      accessToken: "ghu_test",
    });
    for (const response of [
      new Response("sensitive upstream error", { status: 400 }),
      new Response("not JSON"),
      new Response("x".repeat(20000)),
    ]) {
      const failed = await createBroker(config, {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
      })(request());
      expect(failed.status).toBe(502);
      expect(await failed.text()).not.toContain("sensitive");
    }
  });
  it("bounds failed fetch and stalled fetch/body requests", async () => {
    const thrown = await createBroker(config, {
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error("SECRET")),
    })(request());
    expect(thrown.status).toBe(502);
    for (const upstream of [
      vi.fn<typeof fetch>(() => new Promise(() => {})),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(new ReadableStream({ start() {} }))),
    ]) {
      const result = await createBroker(config, {
        fetch: upstream,
        timeoutMs: 5,
      })(request());
      expect(result.status).toBe(502);
      expect(upstream.mock.calls[0][1]?.signal?.aborted).toBe(true);
    }
  });
  it("serves health and rejects malformed Node requests through the real adapter", async () => {
    const server = createServer(
      createNodeHandler({
        GITHUB_APP_CLIENT_ID: config.clientId,
        GITHUB_APP_CLIENT_SECRET: config.clientSecret,
      }),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address() as { port: number };
      const base = `http://127.0.0.1:${address.port}`;
      expect(await (await fetch(`${base}/health`)).json()).toEqual({
        status: "ok",
      });
      const result = await fetch(`${base}/api/github/exchange`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      expect(result.status).toBe(400);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
