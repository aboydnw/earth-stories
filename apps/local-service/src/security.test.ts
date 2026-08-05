import { describe, expect, it } from "vitest";
import { isTrustedMutationOrigin } from "./security.js";

describe("local mutation origin policy", () => {
  it("allows local editor and non-browser requests", () => {
    expect(isTrustedMutationOrigin(undefined)).toBe(true);
    expect(isTrustedMutationOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isTrustedMutationOrigin("http://localhost:5173")).toBe(true);
  });

  it("rejects remote, opaque, and malformed origins", () => {
    expect(isTrustedMutationOrigin("https://attacker.example")).toBe(false);
    expect(isTrustedMutationOrigin("null")).toBe(false);
    expect(isTrustedMutationOrigin("not a URL")).toBe(false);
  });
});
