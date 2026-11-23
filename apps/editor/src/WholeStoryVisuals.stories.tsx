import mapData from "./fixtures/whole-story-map.geojson?no-inline&url";
import style from "./fixtures/whole-story-basemap.json?no-inline&url";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { compileProject } from "@earth-stories/publisher/compile";
import {
  storyProjectSchema,
  type VisualSequence,
} from "@earth-stories/story-schema";
import { StoryViewer, FocusedChapterViewer } from "@earth-stories/viewer";
import {
  glacierSequence,
  hurricaneSequence,
  visualFixtureChapters,
} from "./visualSequenceFixtures";

// Entirely synthetic local evidence: this fixture makes no scientific claims.
const dataUrl = (type: string, text: string) =>
  `data:${type},${encodeURIComponent(text)}`;
function fixture(sequence: VisualSequence, title: string) {
  const accentScene = { ...sequence.scene, width: 1200, height: 900 };
  const project = storyProjectSchema.parse({
    schema: "earth-stories/project/v3",
    id: "whole-story-fixture",
    metadata: {
      title,
      description: "Synthetic observations for reader interaction testing",
      author: null,
      created: "2026-11-22T00:00:00Z",
      updated: "2026-11-22T00:00:00Z",
    },
    basemap: {
      id: "fixture",
      label: "Blank test basemap",
      styleUrl: "https://example.org/style.json",
      attribution: null,
    },
    publication: { theme: "editorial" },
    sources: [
      {
        id: "observations",
        kind: "local-geojson",
        label: "Synthetic locations",
        path: "observations.geojson",
        delivery: "included",
        attribution: "Synthetic test data",
      },
      {
        id: "trend",
        kind: "csv",
        label: "Synthetic trend",
        path: "trend.csv",
        delivery: "included",
        attribution: "Synthetic test data",
      },
    ],
    chapters: [
      ...visualFixtureChapters,
      {
        id: "map-one",
        type: "scrolly",
        title: "Observe the boundary",
        narrative:
          "This map is interactive. The companion illustration stays beside the narrative, outside the data and map controls. [Read the source](https://example.org/evidence).",
        sourceId: "observations",
        camera: { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 },
      },
      {
        id: "map-two",
        type: "scrolly",
        title: "Follow the change",
        narrative:
          "The same map continues through this second step; its evidence remains unchanged.",
        sourceId: "observations",
        camera: { center: [5, 2], zoom: 3, bearing: 0, pitch: 0 },
      },
      {
        id: "transition",
        type: "illustrated",
        title: "From place to pattern",
        narrative:
          "An illustrative transition connects the map and the observations below.",
        alt: sequence.alt,
        caption: "Illustrative, not measured data",
        scene: sequence.scene,
      },
      {
        id: "chart",
        type: "chart",
        title: "Inspect the observations",
        narrative:
          "The motif returns alongside the explanation. Use the chart and exact-value table to examine the synthetic observations.",
        sourceId: "trend",
        chartType: "line",
        xColumn: "step",
        yColumn: "value",
        xLabel: "Step",
        yLabel: "Synthetic value",
      },
      {
        id: "credits",
        type: "prose",
        title: "Sources and credits",
        narrative:
          "All observations in this fixture are synthetic. The artwork is illustrative.",
      },
    ],
    visualSequences: [sequence],
    visualAccents: [
      {
        id: "map-art",
        chapterId: "map-one",
        placement: "trailing",
        alt: sequence.alt,
        scene: accentScene,
      },
      {
        id: "chart-art",
        chapterId: "chart",
        placement: "margin",
        alt: sequence.alt,
        scene: accentScene,
      },
    ],
  });
  const manifest = compileProject(project);
  return {
    ...manifest,
    basemap: { ...manifest.basemap, styleUrl: style },
    assets: manifest.assets.map((a) => ({
      ...a,
      presentation: { ...a.presentation, legendVisible: false },
      href:
        a.id === "observations"
          ? mapData
          : dataUrl("text/csv", "step,value\n1,10\n2,25\n3,18\n4,8\n"),
    })),
  };
}
const hurricane = fixture(hurricaneSequence, "Hurricane visual treatment");
const ice = fixture(glacierSequence, "Ice visual treatment");
const meta = {
  title: "Reader/Whole story artwork",
  component: StoryViewer,
  parameters: { layout: "fullscreen" },
  args: { manifest: hurricane },
} satisfies Meta<typeof StoryViewer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Hurricane: Story = {};
export const Ice: Story = { args: { manifest: ice } };
export const Cng: Story = { args: { theme: "cng" } };
export const Atlas: Story = { args: { theme: "atlas" } };
export const Static: Story = { args: { snapshotMode: true } };
export const NestedPreview: Story = {
  render: (args) => (
    <div style={{ height: 650, overflowY: "auto" }}>
      <StoryViewer {...args} />
    </div>
  ),
};
export const FocusedChart: Story = {
  render: (args) => (
    <FocusedChapterViewer manifest={args.manifest} chapterId="chart" />
  ),
};

export const InteractiveMap: Story = {
  render: (args) => (
    <FocusedChapterViewer
      manifest={args.manifest}
      chapterId="map-one"
      interactiveMap
    />
  ),
};
