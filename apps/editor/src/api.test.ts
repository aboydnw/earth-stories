import { afterEach, describe, expect, it, vi } from "vitest";
import { getExamples } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("editor API errors", () => {
  it("preserves status and a generic message for an empty non-JSON failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 502 })),
    );

    const error = await getExamples().catch((cause: unknown) => cause);

    expect(error).toMatchObject({
      message: "Earth Stories could not complete that request",
      status: 502,
    });
  });
});
