import { describe, expect, it } from "vitest";
import { parseByteRange } from "./range.js";

describe("parseByteRange", () => {
  it("parses bounded, open-ended, and suffix ranges", () => {
    expect(parseByteRange("bytes=10-19", 100)).toEqual({
      start: 10,
      end: 19,
    });
    expect(parseByteRange("bytes=90-", 100)).toEqual({
      start: 90,
      end: 99,
    });
    expect(parseByteRange("bytes=-8", 100)).toEqual({
      start: 92,
      end: 99,
    });
  });

  it("rejects multipart and unsatisfiable ranges", () => {
    expect(() => parseByteRange("bytes=0-1,4-5", 100)).toThrow();
    expect(() => parseByteRange("bytes=100-", 100)).toThrow();
    expect(() => parseByteRange("items=0-4", 100)).toThrow();
  });
});
