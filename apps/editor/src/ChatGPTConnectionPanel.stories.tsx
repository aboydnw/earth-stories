import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ChatGPTStatus } from "@earth-stories/story-schema";
import { ChatGPTConnectionPanel } from "./ChatGPTConnectionPanel";
import "./storyCreation.css";
const disconnected: ChatGPTStatus = {
  configured: false,
  pending: false,
  activeAccount: null,
  accounts: [],
  error: null,
};
const connected: ChatGPTStatus = {
  ...disconnected,
  configured: true,
  activeAccount: "fixture",
  accounts: [
    {
      id: "fixture",
      label: "author@example.org",
      connected: true,
      planEnabled: true,
    },
  ],
};
const meta = {
  title: "Editor/ChatGPT connection",
  component: ChatGPTConnectionPanel,
  args: { onReady: () => {} },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 640, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatGPTConnectionPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
function fixture(state: ChatGPTStatus | null, models = true) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/generation/")) {
        if (!state) return new Promise<Response>(() => {});
        if (url.endsWith("/models"))
          return Response.json(
            models ? [{ id: "fixture-model", label: "Story model" }] : [],
          );
        if (init?.method === "POST")
          return Response.json({
            url: "http://127.0.0.1:1/launch?ticket=fixture",
          });
        return Response.json(state);
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}
export const SignedOut: Story = { beforeEach: fixture(disconnected) };
export const Connected: Story = { beforeEach: fixture(connected) };
export const WaitingForBrowser: Story = {
  beforeEach: fixture({ ...disconnected, pending: true }),
};
export const Loading: Story = { beforeEach: fixture(null) };
export const NoModels: Story = { beforeEach: fixture(connected, false) };
export const PermissionNeeded: Story = {
  beforeEach: fixture({
    ...connected,
    configured: false,
    error:
      "ChatGPT plan use was not enabled. Continue with ChatGPT to grant access.",
  }),
};
