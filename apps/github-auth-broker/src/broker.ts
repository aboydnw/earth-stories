/** Server-only module. Never import into the editor or packaged desktop runtime. */
export const CALLBACK_URL = "http://127.0.0.1:4318/github/callback";
export const TOKEN_URL = "https://github.com/login/oauth/access_token";
export const MAX_REQUEST_BYTES = 4096;
const MAX_RESPONSE_BYTES = 16384;
const TIMEOUT_MS = 10000;

export interface BrokerConfig {
  clientId: string;
  clientSecret: string;
}

export function readConfig(env: NodeJS.ProcessEnv): BrokerConfig | undefined {
  const clientId = env.GITHUB_APP_CLIENT_ID;
  const clientSecret = env.GITHUB_APP_CLIENT_SECRET;
  if (
    !clientId ||
    !/^[A-Za-z0-9_.-]{1,200}$/.test(clientId) ||
    !clientSecret ||
    !/^[\x21-\x7e]{1,512}$/.test(clientSecret)
  )
    return undefined;
  return { clientId, clientSecret };
}

export function reply(
  status: number,
  body: object,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

export async function boundedText(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error("Body limit");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createBroker(
  config: BrokerConfig | undefined,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): (request: Request) => Promise<Response> {
  const fetcher = options.fetch ?? fetch;
  return async (request) => {
    const url = new URL(request.url);
    if (
      url.search ||
      !["/health", "/api/github/exchange"].includes(url.pathname)
    ) {
      return reply(404, { error: "Not found" });
    }
    // This is a native-service endpoint, not a browser API. Never enable CORS.
    if (
      request.headers.has("origin") ||
      request.headers.has("sec-fetch-site")
    ) {
      return reply(403, { error: "Browser requests are not supported" });
    }
    const method = url.pathname === "/health" ? "GET" : "POST";
    if (request.method !== method)
      return reply(405, { error: "Method not allowed" }, { Allow: method });
    if (!config) return reply(503, { error: "Service unavailable" });
    if (url.pathname === "/health") return reply(200, { status: "ok" });
    if (
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        request.headers.get("content-type") ?? "",
      ) ||
      request.headers.has("content-encoding")
    ) {
      return reply(415, { error: "Expected uncompressed JSON" });
    }
    const contentLength = request.headers.get("content-length");
    if (
      contentLength !== null &&
      (!/^\d+$/.test(contentLength) ||
        Number(contentLength) > MAX_REQUEST_BYTES)
    ) {
      return reply(413, { error: "Request too large" });
    }
    let body: unknown;
    try {
      body = JSON.parse(await boundedText(request.body, MAX_REQUEST_BYTES));
    } catch {
      return reply(400, { error: "Invalid request" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reply(400, { error: "Invalid request" });
    const values = body as Record<string, unknown>;
    if (
      Object.keys(values).length !== 2 ||
      typeof values.code !== "string" ||
      !/^[A-Za-z0-9_.-]{1,512}$/.test(values.code) ||
      typeof values.codeVerifier !== "string" ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(values.codeVerifier)
    )
      return reply(400, { error: "Invalid request" });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Race also bounds a stalled upstream response body. Abort alone relies on fetch implementation.
      const result = await Promise.race([
        (async () => {
          const upstream = await fetcher(TOKEN_URL, {
            method: "POST",
            redirect: "error",
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: config.clientId,
              client_secret: config.clientSecret,
              code: values.code as string,
              code_verifier: values.codeVerifier as string,
              redirect_uri: CALLBACK_URL,
            }),
          });
          if (!upstream.ok) {
            await upstream.body?.cancel();
            throw new Error("Upstream failure");
          }
          const data: unknown = JSON.parse(
            await boundedText(upstream.body, MAX_RESPONSE_BYTES),
          );
          if (!data || typeof data !== "object" || Array.isArray(data))
            throw new Error("Invalid upstream");
          const token = data as Record<string, unknown>;
          if (
            token.error ||
            typeof token.access_token !== "string" ||
            !/^[A-Za-z0-9_]{1,512}$/.test(token.access_token) ||
            typeof token.token_type !== "string" ||
            token.token_type.toLowerCase() !== "bearer" ||
            (token.expires_in !== undefined &&
              (!Number.isSafeInteger(token.expires_in) ||
                (token.expires_in as number) <= 0))
          ) {
            throw new Error("Invalid upstream");
          }
          return {
            accessToken: token.access_token,
            ...(token.expires_in !== undefined
              ? { expiresIn: token.expires_in }
              : {}),
          };
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Timeout"));
          }, options.timeoutMs ?? TIMEOUT_MS);
        }),
      ]);
      return reply(200, result);
    } catch {
      return reply(502, {
        error: "GitHub authorization could not be completed",
      });
    } finally {
      clearTimeout(timer);
    }
  };
}
