import { useEffect, useRef } from "react";
import type { Layer } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { useControl } from "react-map-gl/maplibre";

export function DeckOverlay({
  layers,
  onAfterRender,
}: {
  layers: Layer[];
  onAfterRender?: () => void;
}) {
  const mapRef = useRef<{ style?: unknown } | null>(null);
  const onAfterRenderRef = useRef(onAfterRender);
  onAfterRenderRef.current = onAfterRender;
  const overlay = useControl(({ map }) => {
    mapRef.current = map.getMap();
    return new MapboxOverlay({
      interleaved: false,
      layers,
      onAfterRender: () => onAfterRenderRef.current?.(),
    });
  });
  const initialRender = useRef(true);
  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    if (overlay.getCanvas() === null || !mapRef.current?.style) return;
    overlay.setProps({ layers });
  }, [overlay, layers]);
  return null;
}
