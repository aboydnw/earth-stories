import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryStudio } from "./StoryStudio";

const meta = {
  title: "Editor/Story Studio prototype",
  component: StoryStudio,
  args: { onClose: () => undefined },
} satisfies Meta<typeof StoryStudio>;

export default meta;
export const EdgeOfIce: StoryObj<typeof meta> = {};
