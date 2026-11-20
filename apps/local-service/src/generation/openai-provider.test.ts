import { expect, it, vi } from "vitest";
import { OpenAIProvider } from "./openai-provider.js";
it("never retries authentication errors or exposes provider secrets", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("test-secret-key", { status: 401 }));
  const provider = new OpenAIProvider({ apiKey: "test-secret-key", fetcher });
  await expect(
    provider.plan(
      {
        title: "Water",
        audience: "Public",
        takeaway: "River",
        narrative: "",
        visualDirection: "Ink",
        references: [],
        requestedOutputs: ["prose"],
      },
      [],
      new AbortController().signal,
    ),
  ).rejects.toThrow("authentication");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[1].headers.Authorization).toBe(
    "Bearer test-secret-key",
  );
});
it("fails clearly without configured credentials", async () => {
  const provider = new OpenAIProvider({ apiKey: "" });
  expect(provider.configured).toBe(false);
  await expect(
    provider.illustrate(
      { id: "a", prompt: "River", width: 1024, height: 1024, referenceIds: [] },
      [],
      new AbortController().signal,
    ),
  ).rejects.toThrow("credentials");
});

it("repairs an invalid plan once and then returns a redacted failure", async () => {
  const fetcher = vi.fn(
    async (url: URL | RequestInfo) =>
      new Response(
        JSON.stringify(
          String(url).includes("/models/")
            ? {}
            : {
                status: "completed",
                output: [
                  {
                    content: [{ type: "output_text", text: '{"bad":"data"}' }],
                  },
                ],
              },
        ),
      ),
  );
  const provider = new OpenAIProvider({ apiKey: "test-secret-key", fetcher });
  await expect(
    provider.plan(
      {
        title: "Water",
        audience: "Public",
        takeaway: "River",
        narrative: "",
        visualDirection: "Ink",
        references: [],
        requestedOutputs: ["prose"],
      },
      [],
      new AbortController().signal,
    ),
  ).rejects.toThrow("one repair");
  expect(
    fetcher.mock.calls.filter(([url]) => String(url).endsWith("/responses")),
  ).toHaveLength(2);
});
it("caps transient retries and cancels while waiting", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response("private provider body", {
      status: 429,
      headers: { "Retry-After": "10" },
    }),
  );
  const provider = new OpenAIProvider({ apiKey: "key", fetcher });
  const controller = new AbortController();
  const pending = provider.illustrate(
    { id: "a", prompt: "River", width: 1024, height: 1024, referenceIds: [] },
    [],
    controller.signal,
  );
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("refuses invalid image payloads without saving provider output", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: [
          {
            b64_json: Buffer.from("<script>bad</script>").toString("base64"),
          },
        ],
      }),
    ),
  );
  await expect(
    new OpenAIProvider({ apiKey: "key", fetcher }).illustrate(
      { id: "a", prompt: "River", width: 1024, height: 1024, referenceIds: [] },
      [],
      new AbortController().signal,
    ),
  ).rejects.toThrow("PNG");
});
