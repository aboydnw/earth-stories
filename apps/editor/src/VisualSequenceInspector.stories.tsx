import type { Meta, StoryObj } from "@storybook/react-vite";
import { VisualSequenceInspector } from "./VisualSequenceInspector";
import {
  glacierSequence,
  visualFixtureChapters,
} from "./visualSequenceFixtures";
const meta = {
  title: "Editor/Visual sequence settings",
  component: VisualSequenceInspector,
  args: {
    sequence: glacierSequence,
    chapters: visualFixtureChapters,
    onChange: () => {},
    onRemove: () => {},
    onInspect: () => {},
  },
} satisfies Meta<typeof VisualSequenceInspector>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
