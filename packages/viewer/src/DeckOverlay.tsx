import type { Layer } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { useControl } from "react-map-gl/maplibre";

export function DeckOverlay({ layers }: { layers: Layer[] }) {
  const overlay = useControl(
    () => new MapboxOverlay({ interleaved: false, layers }),
  );
  overlay.setProps({ layers });
  return null;
}
