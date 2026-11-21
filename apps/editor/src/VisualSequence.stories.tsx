import type { Meta, StoryObj } from "@storybook/react-vite";
import { VisualSequence } from "../../../packages/viewer/src/VisualSequence";
import {
  glacierSequence,
  hurricaneSequence,
  visualFixtureChapters,
} from "./visualSequenceFixtures";
import "../../../packages/viewer/src/viewer.css";
const meta = {
  title: "Reader/Continuous visual scenes",
  component: VisualSequence,
  decorators: [
    (Story) => (
      <main className="story-publication story-publication--editorial">
        <Story />
      </main>
    ),
  ],
  args: { chapters: visualFixtureChapters },
} satisfies Meta<typeof VisualSequence>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ice: Story = { args: { sequence: glacierSequence } };
export const Hurricane: Story = { args: { sequence: hurricaneSequence } };
export const ReducedMotion: Story = {
  args: { sequence: hurricaneSequence, snapshotMode: true },
};
export const FocusedStep: Story = {
  args: { sequence: glacierSequence, focusedChapterId: "change" },
};
