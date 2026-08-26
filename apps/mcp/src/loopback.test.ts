import { describe, expect, it } from "vitest";
import { resolveServiceUrl } from "./loopback.js";

describe("resolveServiceUrl", () => {
  it("defaults to the local service", () => {
    expect(resolveServiceUrl(undefined)).toBe("http://127.0.0.1:4317");
    expect(resolveServiceUrl("  ")).toBe("http://127.0.0.1:4317");
  });

  it("accepts any loopback host and port", () => {
    expect(resolveServiceUrl("http://localhost:4319")).toBe(
      "http://localhost:4319",
    );
    expect(resolveServiceUrl("http://[::1]:4317")).toBe("http://[::1]:4317");
    expect(resolveServiceUrl("http://127.0.0.2:4317")).toBe(
      "http://127.0.0.2:4317",
    );
  });

  it("refuses an endpoint on another machine", () => {
    expect(() => resolveServiceUrl("http://192.168.1.5:4317")).toThrow(
      "loopback",
    );
    expect(() => resolveServiceUrl("https://stories.example.com")).toThrow(
      "loopback",
    );
    expect(() => resolveServiceUrl("http://128.0.0.1:4317")).toThrow(
      "loopback",
    );
  });

  it("refuses a non-http scheme or an unparseable value", () => {
    expect(() => resolveServiceUrl("file:///etc/passwd")).toThrow("http(s)");
    expect(() => resolveServiceUrl("not a url")).toThrow("not a URL");
  });
});
