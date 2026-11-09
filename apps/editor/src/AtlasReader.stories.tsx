import type { Meta, StoryObj } from "@storybook/react-vite";
import { compileProject } from "@earth-stories/publisher/compile";
import { storyProjectSchema } from "@earth-stories/story-schema";
import { StoryViewer, FocusedChapterViewer } from "@earth-stories/viewer";
import sea from "../../local-service/src/example-assets/example-storm-track/storm-sea.png";
import intensity from "../../local-service/src/example-assets/example-storm-track/katrina-intensity.csv?url";

// Stable, local-only fixture: map/network states are covered in renderer tests.
const source = compileProject(
  storyProjectSchema.parse({
    schema: "earth-stories/project/v2",
    id: "atlas-reader-fixture",
    metadata: {
      title: "Tracking a hurricane",
      description: "Katrina, August 2005. An illustrated atlas reader fixture.",
      author: "Earth Stories",
      created: "2026-11-09T00:00:00Z",
      updated: "2026-11-09T00:00:00Z",
    },
    publication: { profile: "connected", theme: "atlas" },
    basemap: {
      id: "base",
      label: "Base",
      styleUrl: "https://example.org/style.json",
      attribution: null,
    },
    sources: [
      {
        id: "storm-sea",
        kind: "image",
        label: "An imagined sea",
        path: "storm-sea.png",
        delivery: "included",
        attribution: "AI-generated illustration, not a historical image.",
      },
      {
        id: "katrina-intensity",
        kind: "csv",
        label: "Katrina best-track winds",
        path: "katrina-intensity.csv",
        delivery: "included",
        attribution: "NOAA National Hurricane Center, HURDAT2",
      },
    ],
    chapters: [
      {
        id: "opening",
        type: "image",
        title: "A line is not the whole story",
        narrative:
          "A line across the sea makes a hurricane look simple. Katrina was not. Follow **34 recorded fixes** to see where the storm went and how it changed.",
        sourceId: "storm-sea",
        alt: "Generated engraving of storm clouds above a rough sea.",
        caption:
          "An imagined sea. AI-generated illustration, not a historical view of Katrina.",
      },
      {
        id: "wind",
        type: "chart",
        title: "Reading the wind",
        narrative:
          "Find the steep rise on 28 August, then the decline that begins offshore, before landfall. Open the exact-value table to inspect each observation.",
        sourceId: "katrina-intensity",
        chartType: "line",
        xColumn: "time",
        yColumn: "wind_kt",
        xLabel: "Time (UTC)",
        yLabel: "Maximum sustained wind (knots)",
      },
      {
        id: "sources",
        type: "prose",
        title: "Beyond the line",
        narrative:
          "The center's track is not a wind footprint or a surge model. Its maximum sustained wind does not describe the wind experienced at every place along the coast.",
      },
    ],
  }),
);
const manifest = {
  ...source,
  assets: source.assets.map((asset) => ({
    ...asset,
    href:
      asset.id === "storm-sea"
        ? sea
        : asset.id === "katrina-intensity"
          ? intensity
          : asset.href,
  })),
  chapters: source.chapters.filter((chapter) => chapter.type !== "map"),
};
const meta = {
  title: "Reader/Illustrated Atlas",
  component: StoryViewer,
  parameters: { layout: "fullscreen" },
  args: { manifest },
} satisfies Meta<typeof StoryViewer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Opening: Story = {};
export const Narrow: Story = {
  render: (args) => (
    <div style={{ width: 390, maxWidth: "100%" }}>
      <StoryViewer {...args} />
    </div>
  ),
};
export const ExactValueChart: Story = {
  args: {
    manifest: {
      ...manifest,
      chapters: manifest.chapters.filter((chapter) => chapter.type === "chart"),
    },
  },
};
export const ReadAll: Story = { args: { snapshotMode: true } };

export const FocusedOpening: Story = {
  render: (args) => (
    <div style={{ height: 700 }}>
      <FocusedChapterViewer manifest={args.manifest} chapterId="opening" />
    </div>
  ),
};
export const FocusedChart: Story = {
  render: (args) => (
    <div style={{ height: 700 }}>
      <FocusedChapterViewer manifest={args.manifest} chapterId="wind" />
    </div>
  ),
};
