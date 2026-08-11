// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ProjectChapter,
  ProjectSource,
} from "@earth-stories/story-schema";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { ChapterInspector } from "./ChapterInspector";

afterEach(cleanup);

const sources = [
  {
    id: "coast",
    kind: "local-geojson",
    label: "Coastline",
    path: "data/coast.geojson",
    delivery: "included",
    attribution: null,
    sizeBytes: 1200,
    provenance: {},
  },
  {
    id: "roads",
    kind: "pmtiles",
    label: "Road network",
    locator: "data/roads.pmtiles",
    tileType: "vector",
    delivery: "included",
    attribution: null,
    sizeBytes: 2400,
    provenance: {},
  },
] as unknown as ProjectSource[];

function renderInspector(chapter: ProjectChapter, onUpdateChapter = vi.fn()) {
  render(
    <EarthStoriesProvider>
      <ChapterInspector
        chapter={chapter}
        chapterIndex={1}
        sources={sources}
        sourceUsage={{ coast: 2, roads: 1 }}
        readiness={{ tone: "ready", label: "Ready" }}
        onUpdateChapter={onUpdateChapter}
        onEditSource={() => undefined}
        onAddData={() => undefined}
        currentCamera={null}
      />
    </EarthStoriesProvider>,
  );
}

describe("ChapterInspector", () => {
  it("orders map tasks and keeps technical controls collapsed", () => {
    renderInspector({
      id: "map",
      type: "map",
      title: "Changing coast",
      narrative: "Follow the shore.",
      sourceId: "coast",
      overlaySourceIds: ["roads"],
      camera: { center: [-73, 41], zoom: 5, bearing: 10, pitch: 20 },
    });

    const headings = screen
      .getAllByRole("heading")
      .map((node) => node.textContent);
    expect(headings[0]).toContain("Changing coast");
    expect(screen.getByText("Coastline")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /reader behavior/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /layers/i }).textContent,
    ).toContain("1 overlay");
    expect(
      screen.getByRole("button", { name: /exact coordinates/i }).textContent,
    ).toContain("Zoom 5.0");
    expect(screen.queryByRole("spinbutton", { name: "Longitude" })).toBeNull();
  });

  it("adds an overlay from a focused picker instead of rendering every source", async () => {
    const update = vi.fn();
    renderInspector(
      {
        id: "map",
        type: "map",
        title: "Map",
        narrative: "Context",
        sourceId: "coast",
        overlaySourceIds: [],
        camera: { center: [0, 20], zoom: 1.5, bearing: 0, pitch: 0 },
      },
      update,
    );
    await userEvent.click(screen.getByRole("button", { name: /layers/i }));
    expect(screen.queryByText("Road network")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add overlay" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /road network/i }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ overlaySourceIds: ["roads"] }),
    );
  });

  it("reconciles a video from one URL atomically", async () => {
    const update = vi.fn();
    renderInspector(
      {
        id: "video",
        type: "video",
        title: "Interview",
        narrative: "Watch this.",
        provider: "youtube",
        videoId: "old",
        originalUrl: "https://youtu.be/old",
      },
      update,
    );
    const input = screen.getByRole("textbox", { name: "Video URL" });
    await userEvent.clear(input);
    await userEvent.type(input, "https://vimeo.com/123456");
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: "vimeo",
        videoId: "123456",
        originalUrl: "https://vimeo.com/123456",
      }),
    );
    expect(screen.queryByRole("combobox", { name: /provider/i })).toBeNull();
  });

  it("edits flyovers as captured views and protects the minimum path", async () => {
    const preview = vi.fn();
    render(
      <EarthStoriesProvider>
        <ChapterInspector
          chapter={{
            id: "flight",
            type: "flyover",
            title: "Flight",
            narrative: "Follow the route",
            sourceId: "coast",
            overlaySourceIds: [],
            scrollLength: 1,
            keyframes: [
              {
                center: [0, 0],
                zoom: 2,
                bearing: 0,
                pitch: 0,
                caption: "Start",
              },
              {
                center: [2, 2],
                zoom: 4,
                bearing: 20,
                pitch: 40,
                caption: "Finish",
              },
            ],
          }}
          chapterIndex={2}
          sources={sources}
          sourceUsage={{ coast: 1 }}
          readiness={{ tone: "ready", label: "Ready" }}
          onUpdateChapter={() => undefined}
          onEditSource={() => undefined}
          onAddData={() => undefined}
          currentCamera={null}
          onPreviewCamera={preview}
        />
      </EarthStoriesProvider>,
    );
    await userEvent.click(screen.getAllByRole("button", { name: "Jump" })[1]!);
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({ caption: "Finish" }),
    );
    expect(
      (
        screen.getAllByRole("button", {
          name: "Delete",
        })[0] as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
