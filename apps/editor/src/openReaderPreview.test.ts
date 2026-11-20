import { describe, expect, it } from "vitest";
import { openReaderPreview } from "./openReaderPreview";

describe("reader preview handoff", () => {
  it("reserves a tab immediately but waits for the saved snapshot", async () => {
    const events: string[] = [];
    let complete!: (value: { id: string; revision: string }) => void;
    const saving = new Promise<{ id: string; revision: string }>((resolve) => {
      complete = resolve;
    });
    const pending = openReaderPreview({
      reserveTab: () => {
        events.push("reserve");
        return {
          navigate: (url) => {
            events.push(url);
          },
          close: () => {
            events.push("close");
          },
        };
      },
      saveDraft: () => {
        events.push("save");
        return saving;
      },
      previewUrl: (id) => `/stories/${id}/preview`,
      showError: () => {
        events.push("error");
      },
      showFallbackLink: (url) => {
        events.push(`fallback:${url}`);
      },
    });
    expect(events).toEqual(["reserve", "save"]);
    complete({ id: "saved", revision: "one" });
    await pending;
    expect(events).toEqual(["reserve", "save", "/stories/saved/preview"]);
  });
  it("closes the reserved tab and reports a failed save without navigating", async () => {
    const events: string[] = [];
    const failure = new Error("Disk full");
    await openReaderPreview({
      reserveTab: () => ({
        navigate: (url) => {
          events.push(url);
        },
        close: () => {
          events.push("closed");
        },
      }),
      saveDraft: async () => {
        throw failure;
      },
      previewUrl: (id) => id,
      showError: (error) => {
        events.push((error as Error).message);
      },
      showFallbackLink: () => {},
    });
    expect(events).toEqual(["closed", "Disk full"]);
  });
  it("offers a saved preview link when the browser blocks the tab", async () => {
    let link = "";
    await openReaderPreview({
      reserveTab: () => null,
      saveDraft: async () => ({ id: "story", revision: "two" }),
      previewUrl: (id) => `/stories/${id}/preview`,
      showError: () => {},
      showFallbackLink: (url) => {
        link = url;
      },
    });
    expect(link).toBe("/stories/story/preview");
  });
});
