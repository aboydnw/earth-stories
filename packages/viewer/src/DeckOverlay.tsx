import { useEffect, useMemo, useRef, useState } from "react";
import type { Layer } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { useMap } from "react-map-gl/maplibre";

export function DeckOverlay({
  layers,
  onAfterRender,
  onError,
}: {
  layers: Layer[];
  onAfterRender?: () => void;
  onError?: (message: string) => void;
}) {
  const maps = useMap();
  const onAfterRenderRef = useRef(onAfterRender);
  onAfterRenderRef.current = onAfterRender;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [mapReady, setMapReady] = useState(false);
  const overlay = useMemo(
    () =>
      new MapboxOverlay({
      interleaved: false,
      layers,
      onAfterRender: () => onAfterRenderRef.current?.(),
      onError: (cause: Error) =>
        onErrorRef.current?.(
          cause instanceof Error
            ? cause.message
            : "The data layer could not be rendered.",
        ),
      }),
    [],
  );
  useEffect(() => {
    const map = maps.current?.getMap();
    if (!map) return;
    const eventMap = map as {
      style?: unknown;
      loaded?: () => boolean;
      once?: (event: string, listener: () => void) => void;
      off?: (event: string, listener: () => void) => void;
      addControl: (control: MapboxOverlay) => void;
      hasControl: (control: MapboxOverlay) => boolean;
      removeControl: (control: MapboxOverlay) => void;
    };
    let attached = false;
    const ready = () => {
      if (attached || !eventMap.loaded?.() || !eventMap.style) return;
      eventMap.addControl(overlay);
      attached = true;
      setMapReady(true);
    };
    ready();
    if (!attached) eventMap.once?.("load", ready);
    return () => {
      eventMap.off?.("load", ready);
      if (attached && eventMap.hasControl(overlay))
        eventMap.removeControl(overlay);
    };
  }, [maps, overlay]);
  const appliedLayers = useRef(layers);
  useEffect(() => {
    if (
      !mapReady ||
      appliedLayers.current === layers ||
      overlay.getCanvas() === null
    )
      return;
    overlay.setProps({ layers });
    appliedLayers.current = layers;
  }, [overlay, layers, mapReady]);
  return null;
}
