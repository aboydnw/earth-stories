// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "@deck.gl/core";

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  setProps: vi.fn(),
}));

vi.mock("@deck.gl/mapbox", () => ({
  MapboxOverlay: class {
    constructor(props: unknown) {
      mocks.constructor(props);
    }
    getCanvas = () => document.createElement("canvas");
    setProps = mocks.setProps;
  },
}));

vi.mock("react-map-gl/maplibre", async () => {
  const React = await import("react");
  return {
    useControl: (create: (context: unknown) => unknown) =>
      React.useMemo(
        () =>
          create({
            map: { getMap: () => ({ style: {} }) },
          }),
        [],
      ),
  };
});

import { DeckOverlay } from "./DeckOverlay.js";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DeckOverlay", () => {
  it("supplies initial layers before map attachment and updates them later", () => {
    const first = [{ id: "first" }] as unknown as Layer[];
    const second = [{ id: "second" }] as unknown as Layer[];
    const view = render(<DeckOverlay layers={first} />);

    expect(mocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        interleaved: false,
        layers: first,
        onAfterRender: expect.any(Function),
      }),
    );
    expect(mocks.setProps).not.toHaveBeenCalled();

    view.rerender(<DeckOverlay layers={second} />);
    expect(mocks.setProps).toHaveBeenCalledWith({ layers: second });
  });

  it("reports rendered frames through the latest callback", () => {
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    const layers = [{ id: "layer" }] as unknown as Layer[];
    const view = render(
      <DeckOverlay layers={layers} onAfterRender={firstCallback} />,
    );
    const props = mocks.constructor.mock.calls[0]?.[0] as {
      onAfterRender?: () => void;
    };

    props.onAfterRender?.();
    expect(firstCallback).toHaveBeenCalledOnce();

    view.rerender(
      <DeckOverlay layers={layers} onAfterRender={latestCallback} />,
    );
    props.onAfterRender?.();
    expect(latestCallback).toHaveBeenCalledOnce();
  });

  it("reports deck failures through the latest error callback", () => {
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    const layers = [{ id: "layer" }] as unknown as Layer[];
    const view = render(
      <DeckOverlay layers={layers} onError={firstCallback} />,
    );
    const props = mocks.constructor.mock.calls[0]?.[0] as {
      onError?: (cause: Error) => void;
    };

    props.onError?.(new Error("Deck layer failed"));
    expect(firstCallback).toHaveBeenCalledWith("Deck layer failed");

    view.rerender(<DeckOverlay layers={layers} onError={latestCallback} />);
    props.onError?.(new Error("Updated deck failure"));
    expect(firstCallback).toHaveBeenCalledOnce();
    expect(latestCallback).toHaveBeenCalledWith("Updated deck failure");
  });
});
