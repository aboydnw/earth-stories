import { useEffect, useRef, useState } from "react";
import type { Layer } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { useControl } from "react-map-gl/maplibre";

export function DeckOverlay({
  layers,
  onAfterRender,
  onError,
}: {
  layers: Layer[];
  onAfterRender?: () => void;
  onError?: (message: string) => void;
}) {
  const mapRef = useRef<{ style?: unknown } | null>(null);
  const onAfterRenderRef = useRef(onAfterRender);
  onAfterRenderRef.current = onAfterRender;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [mapReady, setMapReady] = useState(false);
  const overlay = useControl(({ map }) => {
    mapRef.current = map.getMap();
    return new MapboxOverlay({
      interleaved: false,
      layers,
      onAfterRender: () => onAfterRenderRef.current?.(),
      onError: (cause: Error) =>
        onErrorRef.current?.(
          cause instanceof Error
            ? cause.message
            : "The data layer could not be rendered.",
        ),
    });
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const eventMap = map as {
      loaded?: () => boolean;
      once?: (event: string, listener: () => void) => void;
      off?: (event: string, listener: () => void) => void;
    };
    if (eventMap.loaded?.()) {
      setMapReady(true);
      return;
    }
    const ready = () => setMapReady(true);
    eventMap.once?.("load", ready);
    return () => eventMap.off?.("load", ready);
  }, []);
  const initialRender = useRef(true);
  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    if (!mapReady || overlay.getCanvas() === null) return;
    overlay.setProps({ layers });
  }, [overlay, layers, mapReady]);
  return null;
}
