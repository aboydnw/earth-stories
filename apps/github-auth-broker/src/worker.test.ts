import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./worker.js";
import { TOKEN_URL } from "./broker.js";

afterEach(() => vi.unstubAllGlobals());

describe("Workers request adapter", () => {
  it.each([
    ["exchange", { code: "code123", codeVerifier: "a".repeat(43) }],
    ["refresh", { refreshToken: "ghr_old" }],
  ])(
    "forwards %s through the real Worker entrypoint using only binding credentials",
    async (path, body) => {
      const upstream = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "ghu_new",
            token_type: "bearer",
            expires_in: 28800,
            refresh_token: "ghr_new",
            refresh_token_expires_in: 15897600,
          }),
        ),
      );
      vi.stubGlobal("fetch", upstream);
      const response = await worker.fetch(
        new Request(`https://broker.test/api/github/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        {
          GITHUB_APP_CLIENT_ID: "Iv1.worker",
          GITHUB_APP_CLIENT_SECRET: "binding_secret",
        },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        accessToken: "ghu_new",
        expiresIn: 28800,
        refreshToken: "ghr_new",
        refreshTokenExpiresIn: 15897600,
      });
      expect(upstream.mock.calls[0][0]).toBe(TOKEN_URL);
      const form = upstream.mock.calls[0][1]?.body as URLSearchParams;
      expect(form.get("client_id")).toBe("Iv1.worker");
      expect(form.get("client_secret")).toBe("binding_secret");
    },
  );
  it("does not leak failed upstream details or binding values", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error("binding_secret ghr_old")),
    );
    const response = await worker.fetch(
      new Request("https://broker.test/api/github/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: "ghr_old" }),
      }),
      {
        GITHUB_APP_CLIENT_ID: "Iv1.worker",
        GITHUB_APP_CLIENT_SECRET: "binding_secret",
      },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "GitHub authorization could not be completed",
    });
  });
});
