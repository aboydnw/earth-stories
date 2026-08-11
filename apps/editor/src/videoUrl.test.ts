import { describe, expect, it } from "vitest";
import { analyzeStoredVideo, parseVideoUrl } from "./videoUrl";

describe("parseVideoUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc_123-def", "youtube", "abc_123-def"],
    ["https://youtu.be/abc123?t=4", "youtube", "abc123"],
    ["https://www.youtube.com/embed/abc123", "youtube", "abc123"],
    ["https://www.youtube-nocookie.com/embed/abc123", "youtube", "abc123"],
    ["https://vimeo.com/987654", "vimeo", "987654"],
    ["https://player.vimeo.com/video/987654", "vimeo", "987654"],
  ] as const)("parses %s", (originalUrl, provider, videoId) => {
    expect(parseVideoUrl(originalUrl)).toEqual({
      provider,
      videoId,
      originalUrl,
    });
  });

  it.each([
    "javascript:alert(1)",
    "https://user:secret@youtube.com/watch?v=abc",
    "https://youtube.com/watch",
    "https://example.com/watch?v=abc",
    "https://vimeo.com/not-a-number",
    "not a url",
  ])("rejects unsafe or unsupported input: %s", (value) => {
    expect(parseVideoUrl(value)).toBeNull();
  });
});

describe("analyzeStoredVideo", () => {
  it("reports an invalid stored URL without changing the working embed", () => {
    expect(
      analyzeStoredVideo({
        provider: "youtube",
        videoId: "abc123",
        originalUrl: "https://www.youtube.com/",
      }),
    ).toEqual({ status: "invalid", parsed: null });
  });

  it("reports provider and ID disagreement", () => {
    expect(
      analyzeStoredVideo({
        provider: "youtube",
        videoId: "abc123",
        originalUrl: "https://vimeo.com/987654",
      }).status,
    ).toBe("mismatch");
  });

  it("accepts a matching legacy embed", () => {
    expect(
      analyzeStoredVideo({
        provider: "vimeo",
        videoId: "987654",
        originalUrl: "https://player.vimeo.com/video/987654",
      }).status,
    ).toBe("valid");
  });
});
