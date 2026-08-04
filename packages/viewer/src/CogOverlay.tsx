import { useMemo } from "react";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { useControl } from "react-map-gl/maplibre";
import type { PublicationAsset } from "@earth-stories/story-schema";
import { buildCogLayers } from "./CogLayer.js";

export function CogOverlay({
  asset,
  url,
  onError,
}: {
  asset: PublicationAsset;
  url: string;
  onError: (message: string) => void;
}) {
  const layers = useMemo(
    () => buildCogLayers(asset, url, onError),
    [asset, onError, url],
  );
  const overlay = useControl(
    () => new MapboxOverlay({ interleaved: false, layers }),
  );
  overlay.setProps({ layers });
  return null;
}
