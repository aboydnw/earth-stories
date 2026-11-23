// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import * as api from "./api";
import { ChatGPTConnectionPanel } from "./ChatGPTConnectionPanel";
vi.mock("./api", () => ({
  chatGPTStatus: vi.fn(async () => ({
    configured: true,
    pending: false,
    activeAccount: "one",
    accounts: [
      { id: "one", label: "Tester", connected: true, planEnabled: true },
    ],
  })),
  connectChatGPT: vi.fn(),
  cancelChatGPT: vi.fn(),
  chatGPTModels: vi.fn(async () => [
    { id: "first", label: "First" },
    { id: "saved", label: "Saved" },
  ]),
}));
afterEach(cleanup);
it("uses the active account and saved model without redundant sign-in controls", async () => {
  const ready = vi.fn();
  render(
    <EarthStoriesProvider>
      <ChatGPTConnectionPanel selectedModel="saved" onReady={ready} />
    </EarthStoriesProvider>,
  );
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true, "saved"));
  expect(
    (screen.getByLabelText("ChatGPT account") as HTMLSelectElement).value,
  ).toBe("one");
  expect(
    screen.queryByRole("button", { name: "Continue with ChatGPT" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Manage usage" })).toBeNull();
  expect(screen.getByRole("button", { name: "Add account" })).toBeTruthy();
});

it("keeps generation unavailable during an account switch and recovers from a failed launch", async () => {
  vi.mocked(api.chatGPTStatus).mockResolvedValue({
    configured: true,
    pending: false,
    activeAccount: "one",
    accounts: [
      { id: "one", label: "First", connected: true, planEnabled: true },
      { id: "two", label: "Second", connected: true, planEnabled: true },
    ],
    error: null,
  });
  let reject!: (cause: Error) => void;
  vi.mocked(api.connectChatGPT).mockReturnValue(
    new Promise((_, no) => {
      reject = no;
    }),
  );
  vi.spyOn(window, "open").mockReturnValue(null);
  const ready = vi.fn();
  render(
    <EarthStoriesProvider>
      <ChatGPTConnectionPanel onReady={ready} />
    </EarthStoriesProvider>,
  );
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true, "first"));
  fireEvent.change(screen.getByLabelText("ChatGPT account"), {
    target: { value: "two" },
  });
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith(false, "first"));
  expect(api.connectChatGPT).toHaveBeenCalledWith("two");
  reject(new Error("Could not launch sign-in"));
  await screen.findByText("Could not launch sign-in");
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true, "first"));
  expect(
    (screen.getByLabelText("ChatGPT account") as HTMLSelectElement).value,
  ).toBe("one");
});

it("selects the first saved account for reconnect without claiming it is ready", async () => {
  vi.mocked(api.chatGPTStatus).mockResolvedValue({
    configured: false,
    pending: false,
    activeAccount: null,
    accounts: [
      { id: "saved", label: "Saved", connected: false, planEnabled: false },
    ],
    error: null,
  });
  const ready = vi.fn();
  render(
    <EarthStoriesProvider>
      <ChatGPTConnectionPanel selectedModel="missing" onReady={ready} />
    </EarthStoriesProvider>,
  );
  await screen.findByRole("button", { name: "Reconnect" });
  expect(
    (screen.getByLabelText("ChatGPT account") as HTMLSelectElement).value,
  ).toBe("saved");
  expect(ready).toHaveBeenLastCalledWith(false, undefined);
});
