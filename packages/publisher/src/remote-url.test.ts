import { describe, expect, it } from "vitest";
import { validateRemoteUrl } from "./remote-url.js";

describe("remote URL policy", () => {
  it.each([
    "http://localhost/data.tif",
    "http://127.0.0.1/data.tif",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.1/data.tif",
    "http://[::1]/data.tif",
    "http://[::ffff:7f00:1]/data.tif",
    "https://user:password@example.com/data.tif",
  ])("rejects unsafe destination %s", (url) => {
    expect(() => validateRemoteUrl(url)).toThrow();
  });

  it("accepts a public HTTPS URL", () => {
    expect(validateRemoteUrl("https://example.com/data.tif").hostname).toBe(
      "example.com",
    );
  });
});
