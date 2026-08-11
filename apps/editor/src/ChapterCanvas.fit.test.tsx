// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Camera,
  ProjectChapter,
  PublicationManifest,
} from "@earth-stories/story-schema";

vi.mock("@earth-stories/viewer", async () => {
  const React = await import("react");
  return {
    StoryViewer: () => <div>Story preview</div>,
    FocusedChapterViewer: (props: {
      chapterId: string;
      fitRequestToken?: string;
      commitAutoFit?: boolean;
      onFitAvailabilityChange?: (available: boolean) => void;
      onFitCameraChange?: (camera: Camera) => void;
    }) => {
      React.useEffect(() => {
        props.onFitAvailabilityChange?.(true);
      }, [props.chapterId, props.onFitAvailabilityChange]);
      React.useEffect(() => {
        if (!props.commitAutoFit) return;
        props.onFitCameraChange?.({
          center: [12, 34],
          zoom: 8,
          bearing: 0,
          pitch: 0,
        });
      }, [props.commitAutoFit, props.onFitCameraChange]);
      return (
        <div
          data-testid="focused-viewer"
          data-fit-token={props.fitRequestToken ?? ""}
        />
      );
    },
  };
});

import { ChapterCanvas } from "./ChapterCanvas";

afterEach(cleanup);

const camera = {
  center: [0, 20] as [number, number],
  zoom: 1.5,
  bearing: 0,
  pitch: 0,
};
const chapter = (id: string, sourceId: string): ProjectChapter => ({
  id,
  type: "map",
  title: id,
  narrative: "",
  sourceId,
  overlaySourceIds: [],
  camera,
});
const manifest = { assets: [], chapters: [] } as unknown as PublicationManifest;

describe("ChapterCanvas fit lifecycle", () => {
  it("does not replay a fit request after switching chapter or source", async () => {
    const { rerender } = render(
      <ChapterCanvas
        mode="chapter"
        onModeChange={() => undefined}
        selectedChapter={chapter("one", "source-a")}
        focusedManifest={manifest}
        fullManifest={null}
        savedCamera={camera}
        onCameraCommit={() => undefined}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Use fitted view" }),
    );
    expect(
      screen.getByTestId("focused-viewer").getAttribute("data-fit-token"),
    ).toContain("one:source-a");

    rerender(
      <ChapterCanvas
        mode="chapter"
        onModeChange={() => undefined}
        selectedChapter={chapter("two", "source-b")}
        focusedManifest={manifest}
        fullManifest={null}
        savedCamera={camera}
        onCameraCommit={() => undefined}
      />,
    );
    expect(
      screen.getByTestId("focused-viewer").getAttribute("data-fit-token"),
    ).toBe("");

    rerender(
      <ChapterCanvas
        mode="chapter"
        onModeChange={() => undefined}
        selectedChapter={chapter("two", "source-c")}
        focusedManifest={manifest}
        fullManifest={null}
        savedCamera={camera}
        onCameraCommit={() => undefined}
      />,
    );
    expect(
      screen.getByTestId("focused-viewer").getAttribute("data-fit-token"),
    ).toBe("");
  });

  it("commits the first fitted camera only for an explicit initial-fit intent", () => {
    const onCameraCommit = vi.fn();
    render(
      <ChapterCanvas
        mode="chapter"
        onModeChange={() => undefined}
        selectedChapter={chapter("new-map", "source")}
        focusedManifest={manifest}
        fullManifest={null}
        savedCamera={camera}
        commitInitialFit
        onCameraCommit={onCameraCommit}
      />,
    );
    expect(onCameraCommit).toHaveBeenCalledOnce();
    expect(onCameraCommit).toHaveBeenCalledWith(
      expect.objectContaining({ center: [12, 34], zoom: 8 }),
    );
  });
});
