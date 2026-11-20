// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { ChatGPTConnectionPanel } from "./ChatGPTConnectionPanel";
import * as api from "./api";
vi.mock("./api", () => ({
  chatGPTStatus: vi.fn(),
  chatGPTModels: vi.fn(),
  connectChatGPT: vi.fn(),
  cancelChatGPT: vi.fn(),
  disconnectChatGPT: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("offers sign-in without asking for an API credential", async () => {
  vi.mocked(api.chatGPTStatus).mockResolvedValue({
    configured: false,
    pending: false,
    activeAccount: null,
    accounts: [],
    error: null,
  });
  const onReady = vi.fn();
  render(
    <EarthStoriesProvider>
      <ChatGPTConnectionPanel onReady={onReady} />
    </EarthStoriesProvider>,
  );
  expect(
    await screen.findByRole("button", { name: "Continue with ChatGPT" }),
  ).toBeTruthy();
  expect(onReady).toHaveBeenCalledWith(false, undefined);
});
it("enables generation only after discovering an account model", async () => {
  vi.mocked(api.chatGPTStatus).mockResolvedValue({
    configured: true,
    pending: false,
    activeAccount: "a",
    accounts: [
      {
        id: "a",
        label: "person@example.org",
        connected: true,
        planEnabled: true,
      },
    ],
    error: null,
  });
  vi.mocked(api.chatGPTModels).mockResolvedValue([
    { id: "model", label: "Story model" },
  ]);
  const onReady = vi.fn();
  render(
    <EarthStoriesProvider>
      <ChatGPTConnectionPanel onReady={onReady} />
    </EarthStoriesProvider>,
  );
  await waitFor(() => expect(onReady).toHaveBeenCalledWith(true, "model"));
  expect(screen.getByText("Using ChatGPT plan")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Manage usage" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(api.disconnectChatGPT).toHaveBeenCalled());
});
