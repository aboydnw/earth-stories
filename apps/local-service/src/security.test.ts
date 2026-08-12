import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  assertCapabilitySecurity,
  isTrustedMutationOrigin,
  requireCapability,
} from "./security.js";

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

describe("local capability policy", () => {
  const request = (authorization?: string): IncomingMessage =>
    ({ headers: { authorization } }) as IncomingMessage;

  it("preserves unauthenticated standalone requests when no token is configured", () => {
    expect(requireCapability(request(), null)).toBe(true);
    expect(requireCapability(request("Bearer unrelated"), null)).toBe(true);
  });

  it("accepts only the configured Bearer capability", () => {
    expect(requireCapability(request(), "desktop-secret")).toBe(false);
    expect(
      requireCapability(request("Basic desktop-secret"), "desktop-secret"),
    ).toBe(false);
    expect(requireCapability(request("Bearer wrong"), "desktop-secret")).toBe(
      false,
    );
    expect(
      requireCapability(request("Bearer desktop-secret"), "desktop-secret"),
    ).toBe(true);
  });

  it.each(["a", "desktop-secret", "  exact bytes\t"])(
    "never accepts missing Authorization for configured token %j",
    (token) => {
      expect(requireCapability(request(), token)).toBe(false);
    },
  );

  it("refuses capability mode without trusted mutation-origin enforcement", () => {
    expect(() => assertCapabilitySecurity("desktop-secret", false)).toThrow(
      /trusted.*origin/i,
    );
    expect(() =>
      assertCapabilitySecurity("desktop-secret", true),
    ).not.toThrow();
    expect(() => assertCapabilitySecurity(null, false)).not.toThrow();
  });
});
