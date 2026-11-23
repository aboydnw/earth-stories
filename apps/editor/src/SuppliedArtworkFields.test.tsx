// @vitest-environment jsdom
import { EarthStoriesProvider } from "@earth-stories/ui";
import { useState } from "react";
import {
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
  fireEvent.click(screen.getByText("Remove illustration"));
  expect(values).toEqual([]);
});
