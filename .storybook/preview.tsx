import type { Preview } from "@storybook/react-vite";
import { EarthStoriesProvider } from "../packages/ui/src/index";
import "../packages/ui/src/styles.css";

const preview: Preview = {
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <EarthStoriesProvider>
        <Story />
      </EarthStoriesProvider>
    ),
  ],
  parameters: {
    layout: "padded",
    a11y: { test: "error" },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    options: {
      storySort: { order: ["Foundations", "Components", "Patterns"] },
    },
  },
};

export default preview;
