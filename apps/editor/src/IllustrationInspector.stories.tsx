import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { projectChapterSchema } from "@earth-stories/story-schema";
import { IllustrationInspector } from "./IllustrationInspector";
import "./editor.css";
const chapter = projectChapterSchema.parse({
  id: "scene",
  type: "illustrated",
  title: "River",
  narrative: "Follow the river.",
  alt: "A river reaching the sea",
  caption: "Illustration",
  scene: {
    width: 1000,
    height: 600,
    layers: [
      { id: "label", kind: "text", text: "Estuary" },
      { id: "missing", kind: "image", sourceId: "missing", alt: "River banks" },
    ],
  },
});
const meta = {
  title: "Editor/Illustrated scenes",
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function Example({ empty = false }: { empty?: boolean }) {
  const [value, setValue] = useState(chapter);
  if (value.type !== "illustrated") return null;
  return (
    <div style={{ maxWidth: 360 }}>
      <IllustrationInspector
        chapter={
          empty ? { ...value, scene: { ...value.scene, layers: [] } } : value
        }
        sources={[]}
        sourceUsage={{}}
        onChange={setValue}
        onEditSource={() => {}}
        onAddData={() => {}}
      />
    </div>
  );
}
export const MissingArtwork: Story = { render: () => <Example /> };
export const Empty: Story = { render: () => <Example empty /> };

function LayeredExample() {
  const [value, setValue] = useState(() =>
    projectChapterSchema.parse({
      ...chapter,
      scene: {
        width: 1600,
        height: 900,
        staticProgress: 0.5,
        layers: [
          { id: "sky", kind: "image", sourceId: "sky", alt: "Distant sky" },
          {
            id: "mist",
            kind: "image",
            sourceId: "mist",
            alt: "Foreground mist",
            keyframes: [
              { at: 0, x: 0, y: 0, scale: 1, opacity: 1, reveal: 1 },
              { at: 1, x: 0.04, y: 0, scale: 1, opacity: 1, reveal: 1 },
            ],
          },
        ],
      },
    }),
  );
  if (value.type !== "illustrated") return null;
  return (
    <div style={{ maxWidth: 360 }}>
      <IllustrationInspector
        chapter={value}
        sources={[]}
        sourceUsage={{}}
        onChange={setValue}
        onEditSource={() => {}}
        onAddData={() => {}}
      />
    </div>
  );
}
export const NamedImageLayers: Story = { render: () => <LayeredExample /> };
export const NarrowImageLayers: Story = {
  globals: { viewport: { value: "mobile1" } },
  render: () => <LayeredExample />,
};
