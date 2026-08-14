import { lookup } from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import { authorizedFetch } from "./remote-fetch.js";

afterEach(() => vi.restoreAllMocks());

describe("authorizedFetch", () => {
  it("revalidates redirects against the configured host policy", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://other.example/file.tif" },
      }),
    );

    await expect(
      authorizedFetch(
        "https://data.example/file.tif",
        {},
        { allowedHosts: new Set(["data.example"]) },
      ),
    ).rejects.toThrow(/not authorized/i);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects a destination that resolves to a private address", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "169.254.169.254", family: 4 },
    ] as never);
    const request = vi.spyOn(globalThis, "fetch");

    await expect(
      authorizedFetch("https://data.example/file.tif"),
    ).rejects.toThrow(/private network/i);
    expect(request).not.toHaveBeenCalled();
  });
});
