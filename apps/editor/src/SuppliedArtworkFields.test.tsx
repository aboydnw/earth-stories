// @vitest-environment jsdom
import { EarthStoriesProvider } from "@earth-stories/ui";
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReferenceInput } from "@earth-stories/story-schema";
import { SuppliedArtworkFields } from "./SuppliedArtworkFields";
import * as api from "./api";
vi.mock("./api", () => ({ prepareArtworkImage: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("uploads actual illustration for generation, supports prepared layers, and removes them with the original", async () => {
  vi.mocked(api.prepareArtworkImage).mockResolvedValue({
    data: "YWJj",
    thumbnail: "YWJj",
    width: 800,
    height: 600,
    hasTransparency: true,
  });
  let values: ReferenceInput[] = [];
  function Form() {
    const [references, setReferences] = useState<ReferenceInput[]>([]);
    const [busy, setBusy] = useState(false);
    values = references;
    return (
      <SuppliedArtworkFields
        references={references}
        onChange={setReferences}
        disabled={busy}
        onBusy={setBusy}
      />
    );
  }
  render(
    <EarthStoriesProvider>
      <Form />
    </EarthStoriesProvider>,
  );
  fireEvent.change(screen.getByLabelText("Original illustration"), {
    target: { files: [new File(["png"], "ice.png", { type: "image/png" })] },
  });
  await waitFor(() => expect(values).toHaveLength(1));
  expect(values[0]).toMatchObject({ artworkRole: "original", name: "ice" });
  const selectedFiles = [
    new File(["png"], "foreground.png", { type: "image/png" }),
  ];
  fireEvent.change(screen.getByLabelText("Prepared layers (optional)"), {
    target: { files: selectedFiles },
  });
  // Browsers clear the live FileList when the picker value is reset.
  selectedFiles.length = 0;
  await waitFor(() => expect(values).toHaveLength(2));
  expect(values[1]).toMatchObject({ artworkRole: "layer" });
  expect(api.prepareArtworkImage).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByText("Remove illustration"));
  expect(values).toEqual([]);
});

it("preserves reference edits made while artwork preparation is pending", async () => {
  let finish!: (
    image: Awaited<ReturnType<typeof api.prepareArtworkImage>>,
  ) => void;
  vi.mocked(api.prepareArtworkImage).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let values: ReferenceInput[] = [];
  function Form() {
    const [references, setReferences] = useState<ReferenceInput[]>([
      {
        kind: "url",
        name: "Reference",
        url: "https://example.org/old",
        classification: "facts",
      },
    ]);
    values = references;
    return (
      <>
        <button
          onClick={() =>
            setReferences((current) =>
              current.map((r) =>
                r.kind === "url"
                  ? {
                      ...r,
                      url: "https://example.org/new",
                      notes: "Keep my edit",
                      classification: "visual-style",
                    }
                  : r,
              ),
            )
          }
        >
          Edit reference
        </button>
        <SuppliedArtworkFields
          references={references}
          onChange={setReferences}
          disabled={false}
          onBusy={() => {}}
        />
      </>
    );
  }
  render(
    <EarthStoriesProvider>
      <Form />
    </EarthStoriesProvider>,
  );
  fireEvent.change(screen.getByLabelText("Original illustration"), {
    target: { files: [new File(["png"], "ice.png")] },
  });
  await waitFor(() => expect(api.prepareArtworkImage).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByText("Edit reference"));
  await act(async () =>
    finish({
      data: "YWJj",
      thumbnail: "YWJj",
      width: 800,
      height: 600,
      hasTransparency: false,
    }),
  );
  await waitFor(() => expect(values).toHaveLength(2));
  expect(values[0]).toMatchObject({
    url: "https://example.org/new",
    notes: "Keep my edit",
    classification: "visual-style",
  });
});
it.each([
  [99, 600],
  [100, 8192],
])(
  "rejects unsuitable artwork dimensions %s x %s before generation",
  async (width, height) => {
    vi.mocked(api.prepareArtworkImage).mockResolvedValue({
      data: "YWJj",
      thumbnail: "YWJj",
      width,
      height,
      hasTransparency: false,
    });
    const onChange = vi.fn();
    render(
      <EarthStoriesProvider>
        <SuppliedArtworkFields
          references={[]}
          onChange={onChange}
          disabled={false}
          onBusy={() => {}}
        />
      </EarthStoriesProvider>,
    );
    fireEvent.change(screen.getByLabelText("Original illustration"), {
      target: { files: [new File(["png"], "ice.png")] },
    });
    await screen.findByText(/both edges at least 100 pixels/);
    expect(onChange).not.toHaveBeenCalled();
  },
);
