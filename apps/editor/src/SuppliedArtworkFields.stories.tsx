import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReferenceInput } from "@earth-stories/story-schema";
import { SuppliedArtworkFields } from "./SuppliedArtworkFields";
const original: ReferenceInput = {
  kind: "upload",
  name: "Original illustration",
  classification: "visual-style",
  mediaType: "image/png",
  artworkRole: "original",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR0cAAAAASUVORK5CYII=",
};
const meta = {
  title: "Editor/Supplied illustration",
  component: SuppliedArtworkFields,
  args: {
    references: [],
    disabled: false,
    onChange: () => {},
    onBusy: () => {},
  },
  render: (args) => {
    const [references, setReferences] = useState(args.references);
    const [busy, setBusy] = useState(false);
    return (
      <SuppliedArtworkFields
        {...args}
        references={references}
        onChange={setReferences}
        onBusy={setBusy}
        disabled={args.disabled || busy}
      />
    );
  },
} satisfies Meta<typeof SuppliedArtworkFields>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Original: Story = { args: { references: [original] } };
export const PreparedLayers: Story = {
  args: {
    references: [
      original,
      { ...original, name: "Foreground", artworkRole: "layer" },
    ],
  },
};
export const Preparing: Story = {
  args: { references: [original], disabled: true },
};
export const Narrow: Story = {
  args: PreparedLayers.args,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
