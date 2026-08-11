export type VideoProvider = "youtube" | "vimeo";
export interface ParsedVideoUrl {
  provider: VideoProvider;
  videoId: string;
  originalUrl: string;
}

const youtubeId = /^[A-Za-z0-9_-]+$/;
const vimeoId = /^\d+$/;

export function parseVideoUrl(value: string): ParsedVideoUrl | null {
  const originalUrl = value.trim();
  let url: URL;
  try {
    url = new URL(originalUrl);
  } catch {
    return null;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  )
    return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let provider: VideoProvider | null = null;
  let videoId: string | null = null;

  if (host === "youtu.be") {
    provider = "youtube";
    videoId = parts[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    provider = "youtube";
    if (parts[0] === "watch") videoId = url.searchParams.get("v");
    else if (parts[0] === "embed" || parts[0] === "shorts")
      videoId = parts[1] ?? null;
  } else if (host === "vimeo.com") {
    provider = "vimeo";
    videoId = parts[0] ?? null;
  } else if (host === "player.vimeo.com" && parts[0] === "video") {
    provider = "vimeo";
    videoId = parts[1] ?? null;
  }

  if (
    !provider ||
    !videoId ||
    !(provider === "youtube" ? youtubeId : vimeoId).test(videoId)
  )
    return null;
  return { provider, videoId, originalUrl };
}

export function analyzeStoredVideo(value: {
  provider: VideoProvider;
  videoId: string;
  originalUrl: string;
}): {
  status: "valid" | "invalid" | "mismatch";
  parsed: ParsedVideoUrl | null;
} {
  const parsed = parseVideoUrl(value.originalUrl);
  if (!parsed) return { status: "invalid", parsed: null };
  return {
    status:
      parsed.provider === value.provider && parsed.videoId === value.videoId
        ? "valid"
        : "mismatch",
    parsed,
  };
}
