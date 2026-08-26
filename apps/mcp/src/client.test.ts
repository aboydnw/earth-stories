import { describe, expect, it, vi } from "vitest";
import { createServiceClient } from "./client.js";

function jsonResponse(status: number, body: unknown) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

describe("createServiceClient", () => {
  it("reads projects from the loopback service", async () => {
    const fetchImpl = jsonResponse(200, [{ id: "p1", title: "One" }]);
    const client = createServiceClient("http://127.0.0.1:4317", fetchImpl);

    expect(await client.listProjects()).toEqual([{ id: "p1", title: "One" }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:4317/api/projects",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("surfaces the service's own error message", async () => {
    const client = createServiceClient(
      "http://127.0.0.1:4317",
      jsonResponse(400, { error: "Enter a public data URL to inspect" }),
    );

    await expect(client.discover("nope")).rejects.toThrow(
      "Enter a public data URL to inspect",
    );
  });

  it("falls back to the status code when the body carries no message", async () => {
    const client = createServiceClient(
      "http://127.0.0.1:4317",
      jsonResponse(500, {}),
    );

    await expect(client.listProjects()).rejects.toThrow("500");
  });

  it("sends a loopback origin so mutations pass the service's origin check", async () => {
    const fetchImpl = jsonResponse(200, { id: "p2" });
    const client = createServiceClient("http://127.0.0.1:4317", fetchImpl);

    await client.createProject("Two").catch(() => undefined);

    const init = fetchImpl.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).origin).toBe(
      "http://127.0.0.1:4317",
    );
    expect(init.body).toBe(JSON.stringify({ title: "Two" }));
  });

  it("encodes project ids into the path", async () => {
    const fetchImpl = jsonResponse(200, {});
    const client = createServiceClient("http://127.0.0.1:4317", fetchImpl);

    await client.preflight("a b/c");

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:4317/api/projects/a%20b%2Fc/export/preflight",
    );
  });
});
