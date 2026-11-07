import { describe, expect, it, vi } from "vitest";
import { boundedText, createBroker, TOKEN_URL } from "./broker.js";
import worker from "./worker.js";
import * as adapter from "../api/github/refresh.js";

const config = { clientId: "Iv1.test", clientSecret: "server_secret" };
const rotated = {
  access_token: "ghu_new",
  token_type: "bearer",
  expires_in: 28800,
  refresh_token: "ghr_new",
  refresh_token_expires_in: 15897600,
  unrelated_secret: "must_not_escape",
};
const request = (
  body: unknown = { refreshToken: "ghr_old" },
  path = "/api/github/refresh",
  headers: Record<string, string> = {},
) =>
  new Request(`https://broker.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const success = {
  accessToken: "ghu_new",
  expiresIn: 28800,
  refreshToken: "ghr_new",
  refreshTokenExpiresIn: 15897600,
};

describe("refresh and Workers broker", () => {
  it("refreshes through the fixed GitHub endpoint and returns only the rotated credential", async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(rotated)));
    const response = await createBroker(config, { fetch: upstream })(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(success);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    const [url, options] = upstream.mock.calls[0];
    expect(url).toBe(TOKEN_URL);
    expect(options?.redirect).toBe("error");
    expect(Object.fromEntries(options?.body as URLSearchParams)).toEqual({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: "ghr_old",
    });
  });
  it("returns paired refresh metadata from code exchange", async () => {
    const response = await createBroker(config, {
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(rotated))),
    })(
      request(
        { code: "code123", codeVerifier: "a".repeat(43) },
        "/api/github/exchange",
      ),
    );
    expect(await response.json()).toEqual(success);
  });
  it.each([
    null,
    [],
    {},
    { refreshToken: "" },
    { refreshToken: "a\nb" },
    { refreshToken: "x".repeat(513) },
    { refreshToken: 42 },
    { refreshToken: "ghr_old", client_id: "other" },
    { refreshToken: "ghr_old", redirect_uri: "https://evil.test" },
    { code: "code123", codeVerifier: "a".repeat(43) },
  ])("rejects invalid refresh input %j before upstream", async (body) => {
    const upstream = vi.fn<typeof fetch>();
    const response = await createBroker(config, { fetch: upstream })(
      request(body),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request" });
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    { ...rotated, refresh_token: undefined },
    { ...rotated, refresh_token_expires_in: undefined },
    { ...rotated, refresh_token: "" },
    { ...rotated, refresh_token: "ghr_\nsecret" },
    { ...rotated, refresh_token_expires_in: 0 },
    { ...rotated, refresh_token_expires_in: 1.5 },
    { ...rotated, refresh_token_expires_in: "100" },
    { ...rotated, refresh_token_expires_in: Number.MAX_SAFE_INTEGER + 1 },
    { ...rotated, expires_in: undefined },
  ])(
    "rejects partial/invalid rotation on exchange and refresh: %j",
    async (data) => {
      for (const input of [
        request(),
        request(
          { code: "code123", codeVerifier: "a".repeat(43) },
          "/api/github/exchange",
        ),
      ]) {
        const response = await createBroker(config, {
          fetch: vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(JSON.stringify(data))),
        })(input);
        expect(response.status).toBe(502);
        expect(await response.text()).toBe(
          '{"error":"GitHub authorization could not be completed"}',
        );
      }
    },
  );
  it("requires rotation on refresh even when GitHub returns a valid non-expiring access token", async () => {
    const response = await createBroker(config, {
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ access_token: "ghu_new", token_type: "bearer" }),
          ),
        ),
    })(request());
    expect(response.status).toBe(502);
  });
  it("does not reflect a revoked/replayed refresh token error", async () => {
    const response = await createBroker(config, {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "bad_refresh_token",
            error_description: "ghr_old sensitive",
          }),
          { status: 400 },
        ),
      ),
    })(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("ghr_old");
  });
  it("applies content, origin and body limits to refresh", async () => {
    const upstream = vi.fn<typeof fetch>();
    const handle = createBroker(config, { fetch: upstream });
    for (const [headers, status] of [
      [{ origin: "https://evil.test" }, 403],
      [{ "sec-fetch-site": "none" }, 403],
      [{ "content-encoding": "gzip" }, 415],
      [{ "content-length": "5000" }, 413],
      [{ "content-type": "text/plain" }, 415],
    ] as const) {
      expect(
        (
          await handle(
            request(
              { refreshToken: "ghr_old" },
              "/api/github/refresh",
              headers,
            ),
          )
        ).status,
      ).toBe(status);
    }
    expect(
      (await handle(request({ refreshToken: "x".repeat(5000) }))).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("bounds refresh fetch and body stalls", async () => {
    for (const upstream of [
      vi.fn<typeof fetch>(() => new Promise(() => {})),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(new ReadableStream({ start() {} }))),
    ]) {
      const response = await createBroker(config, {
        fetch: upstream,
        timeoutMs: 5,
      })(request());
      expect(response.status).toBe(502);
      expect(upstream.mock.calls[0][1]?.signal?.aborted).toBe(true);
    }
  });
  it("exposes the same method guards on the Vercel refresh adapter", async () => {
    expect(
      (await adapter.GET(new Request("https://broker.test/api/github/refresh")))
        .status,
    ).toBe(405);
  });
  it("serves Workers health using bindings and rejects unconfigured requests safely", async () => {
    expect((await worker.fetch(request(), {})).status).toBe(503);
    const response = await worker.fetch(
      new Request("https://broker.test/health"),
      {
        GITHUB_APP_CLIENT_ID: config.clientId,
        GITHUB_APP_CLIENT_SECRET: config.clientSecret,
      },
    );
    expect(await response.json()).toEqual({ status: "ok" });
    expect(
      (
        await worker.fetch(
          new Request("https://broker.test/api/github/refresh"),
          {},
        )
      ).status,
    ).toBe(405);
  });
  it("decodes multibyte stream chunks using Web APIs", async () => {
    const bytes = new TextEncoder().encode("🌍 café");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2));
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });
    expect(await boundedText(stream, 100)).toBe("🌍 café");
  });
});
