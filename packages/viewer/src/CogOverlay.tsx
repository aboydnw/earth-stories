import { useMemo } from "react";
import type { PublicationAsset } from "@earth-stories/story-schema";
import { buildCogLayers } from "./CogLayer.js";
import { DeckOverlay } from "./DeckOverlay.js";

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
  return <DeckOverlay layers={layers} />;
}
