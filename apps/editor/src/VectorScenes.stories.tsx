import type { Meta, StoryObj } from "@storybook/react-vite";
import { compileProject } from "@earth-stories/publisher/compile";
import {
  composeVectorScene,
  vectorScenePalettes,
  storyProjectSchema,
  type VectorRecipe,
} from "@earth-stories/story-schema";
import { StoryViewer, FocusedChapterViewer } from "@earth-stories/viewer";

const templates: VectorRecipe["template"][] = [
  "landscape",
  "flow",
  "reveal",
  "diagram",
];
const manifest = compileProject(
  storyProjectSchema.parse({
    schema: "earth-stories/project/v3",
    id: "vector-scenes",
    metadata: {
      title: "From the ridge to the estuary",
      description:
        "A fictional watershed, composed from four editable vector scenes.",
      author: null,
      created: "2026-11-20T00:00:00Z",
      updated: "2026-11-20T00:00:00Z",
    },
    basemap: {
      id: "none",
      label: "No map required",
      styleUrl: "https://example.org/style.json",
      attribution: null,
    },
    publication: { theme: "atlas", palette: vectorScenePalettes.estuary },
    sources: [],
    chapters: templates.map((template, i) => ({
      id: template,
      type: "illustrated",
      title: [
        "Where water begins",
        "Following the current",
        "A landscape in layers",
        "One connected watershed",
      ][i],
      narrative: [
        "Rain gathers in the highlands. Small streams join, carrying water through a landscape shaped by their passage.",
        "A river connects distant places. Its current moves through forests, floodplains, and the estuary.",
        "Each part of the watershed plays a different role. These conceptual layers show relationships, not measured quantities.",
        "The watershed is a connected system. Changes upstream can travel well beyond the place where they begin.",
      ][i],
      alt: `Conceptual ${template} illustration of a fictional watershed.`,
      caption: "Illustrative scene — not measured geographic data.",
      scene: composeVectorScene({
        template,
        heading: [
          "Water shapes a landscape",
          "From source to sea",
          "Four layers, one landscape",
          "Everything flows downstream",
        ][i]!,
        labels: [
          "Rain in the highlands",
          "Streams through the forest",
          "Floodplain and wetlands",
          "The open estuary",
        ],
        motif: "mountains",
        motion: true,
      }),
    })),
  }),
);
const meta = {
  title: "Reader/Generated vector scenes",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const FullStory: Story = {
  render: () => <StoryViewer manifest={manifest} />,
};
export const Landscape: Story = {
  render: () => (
    <FocusedChapterViewer manifest={manifest} chapterId="landscape" />
  ),
};
export const Flow: Story = {
  render: () => <FocusedChapterViewer manifest={manifest} chapterId="flow" />,
};
export const Reveal: Story = {
  render: () => <FocusedChapterViewer manifest={manifest} chapterId="reveal" />,
};
export const Diagram: Story = {
  render: () => (
    <FocusedChapterViewer manifest={manifest} chapterId="diagram" />
  ),
};
export const StillFrame: Story = {
  render: () => (
    <FocusedChapterViewer
      manifest={manifest}
      chapterId="landscape"
      snapshotMode
    />
  ),
};
