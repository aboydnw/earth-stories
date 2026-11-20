// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { projectChapterSchema } from "@earth-stories/story-schema";
import { IllustrationInspector } from "./IllustrationInspector";
afterEach(cleanup);
it("edits descriptions and motion without replacing layer identities", () => {
  const chapter = projectChapterSchema.parse({
    id: "a",
    type: "illustrated",
    title: "Water",
    narrative: "",
    alt: "",
    scene: {
      width: 1000,
      height: 600,
      layers: [{ id: "label", kind: "text", text: "River" }],
    },
  });
  if (chapter.type !== "illustrated") throw Error("fixture");
  const onChange = vi.fn();
  render(
    <EarthStoriesProvider>
      <IllustrationInspector
        chapter={chapter}
        sources={[]}
        sourceUsage={{}}
        onChange={onChange}
        onEditSource={() => {}}
        onAddData={() => {}}
      />
    </EarthStoriesProvider>,
  );
  fireEvent.change(screen.getByLabelText("Alternative description"), {
    target: { value: "A river reaching the sea" },
  });
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      alt: "A river reaching the sea",
      scene: chapter.scene,
    }),
  );
  fireEvent.change(screen.getByLabelText("Motion strength"), {
    target: { value: "0" },
  });
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ scene: { ...chapter.scene, motionStrength: 0 } }),
  );
  fireEvent.change(screen.getByLabelText("Layer 1 text"), {
    target: { value: "Estuary" },
  });
  expect(onChange.mock.lastCall?.[0].scene.layers[0]).toEqual({
    ...chapter.scene.layers[0],
    text: "Estuary",
  });
});
