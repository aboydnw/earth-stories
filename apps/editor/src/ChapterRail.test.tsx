// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectChapter } from "@earth-stories/story-schema";
import { ChapterRail } from "./ChapterRail";

afterEach(cleanup);

const chapters = [
  {
    id: "intro",
    type: "prose",
    title: "Introduction",
    narrative: "Opening",
  },
  {
    id: "map",
    type: "map",
    title: "Changing shoreline",
    narrative: "Read the coast",
    sourceId: "shore",
    overlaySourceIds: [],
    camera: {
      center: [0, 20],
      zoom: 1.5,
      bearing: 0,
      pitch: 0,
    },
  },
] satisfies ProjectChapter[];

describe("ChapterRail", () => {
  it("selects a chapter, requests its editor, and exposes readiness in words", async () => {
    const user = userEvent.setup();
    const onSelectChapter = vi.fn();
    const onRequestRegion = vi.fn();

    render(
      <ChapterRail
        projectTitle="Coast story"
        chapters={chapters}
        activeChapterId="intro"
        mode="chapter"
        readiness={{ map: { tone: "error", label: "Choose data" } }}
        onWorkspace={() => undefined}
        onStory={() => undefined}
        onStoryData={() => undefined}
        onSelectChapter={onSelectChapter}
        onRequestRegion={onRequestRegion}
        onMove={() => undefined}
        onDuplicate={() => undefined}
        onDelete={() => undefined}
        addChapter={<button>Add chapter</button>}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /changing shoreline/i }),
    );

    expect(onSelectChapter).toHaveBeenCalledWith("map");
    expect(onRequestRegion).toHaveBeenCalledWith("edit");
    expect(screen.getByText("Choose data")).toBeTruthy();
  });

  it("keeps chapter actions labeled and protects the first and last positions", () => {
    render(
      <ChapterRail
        projectTitle="Coast story"
        chapters={chapters}
        activeChapterId="intro"
        mode="chapter"
        readiness={{}}
        onWorkspace={() => undefined}
        onStory={() => undefined}
        onStoryData={() => undefined}
        onSelectChapter={() => undefined}
        onRequestRegion={() => undefined}
        onMove={() => undefined}
        onDuplicate={() => undefined}
        onDelete={() => undefined}
        addChapter={<button>Add chapter</button>}
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: "Move chapter up",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Duplicate chapter" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete chapter" })).toBeTruthy();
  });
});
