// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import type { GenerationJob } from "@earth-stories/story-schema";
import { GenerationResult } from "./GenerationResult";
afterEach(cleanup);
export const reviewJob = {
  id: "review",
  stage: "ready",
  enhancement: { projectId: "story" },
  brief: { narrative: "Ice context", visualDirection: "Quiet blue artwork" },
  plan: { chapters: [], textEdits: [] },
  candidate: {
    digest: "digest",
    project: {
      metadata: { title: "Ice", description: "A changing coast" },
      publication: {},
      chapters: [{ id: "intro", title: "Arrival", type: "prose" }],
      visualSequences: [],
    },
    assets: [],
    warnings: ["Map preview unavailable"],
  },
} as unknown as GenerationJob;
it("leads with preview, keeps approval and edit adjacent, and discloses details", () => {
  const accept = vi.fn(),
    edit = vi.fn();
  const { container } = render(
    <EarthStoriesProvider>
      <GenerationResult
        job={reviewJob}
        accepting={false}
        onAccept={accept}
        onEditInstructions={edit}
      />
    </EarthStoriesProvider>,
  );
  const actions = screen.getByRole("group", { name: "Review story" });
  expect(actions.querySelector("a")?.textContent).toContain("Preview story");
  expect(actions.querySelector("a")?.getAttribute("href")).toContain(
    "/stories/story/enhance/review/preview",
  );
  fireEvent.click(screen.getByRole("button", { name: "Apply to story" }));
  expect(accept).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Edit instructions" }));
  expect(edit).toHaveBeenCalledOnce();
  expect(container.querySelector("details")?.open).toBe(false);
  expect(screen.getByText(/1 source or review note/)).toBeTruthy();
});
it("disables applying while saving and shows supporting text changes expanded", () => {
  const job = {
    ...reviewJob,
    plan: {
      ...reviewJob.plan!,
      textEdits: [
        {
          chapterId: "intro",
          before: "Before",
          after: "After",
          reason: "Support the visual",
          visualChapterId: "scene",
        },
      ],
    },
  };
  const { container } = render(
    <EarthStoriesProvider>
      <GenerationResult
        job={job}
        accepting
        onAccept={() => {}}
        onEditInstructions={() => {}}
      />
    </EarthStoriesProvider>,
  );
  expect(
    screen
      .getByRole("button", { name: "Applying enhancements…" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    container.querySelector("details[data-text-changes]")?.hasAttribute("open"),
  ).toBe(true);
});

it("groups discard with candidate review and blocks it during acceptance", () => {
  const discard = vi.fn();
  const props = {
    job: reviewJob,
    accepting: false,
    discarding: false,
    onAccept: vi.fn(),
    onEditInstructions: vi.fn(),
    onDiscard: discard,
  };
  const { rerender } = render(
    <EarthStoriesProvider>
      <GenerationResult {...props} />
    </EarthStoriesProvider>,
  );
  const button = screen.getByRole("button", { name: "Discard changes" });
  expect(
    screen.getByRole("group", { name: "Review story" }).contains(button),
  ).toBe(true);
  fireEvent.click(button);
  expect(discard).toHaveBeenCalledOnce();
  rerender(
    <EarthStoriesProvider>
      <GenerationResult {...props} accepting />
    </EarthStoriesProvider>,
  );
  expect(
    screen
      .getByRole("button", { name: "Discard changes" })
      .hasAttribute("disabled"),
  ).toBe(true);
});
