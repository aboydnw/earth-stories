import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { LidarControl } from "maplibre-gl-lidar";
import "maplibre-gl-lidar/style.css";
import type { PublicationAsset } from "@earth-stories/story-schema";

export function CopcOverlay({
  asset,
  onError,
}: {
  asset: PublicationAsset;
  onError: (message: string) => void;
}) {
  const maps = useMap();
  useEffect(() => {
    const map = maps.current?.getMap();
    if (!map || asset.kind !== "copc") return;
    const control = new LidarControl({
      collapsed: true,
      colorScheme: asset.copc?.colorMode ?? "elevation",
      pointSize: asset.copc?.pointSize ?? 2,
      copcLoadingMode: "dynamic",
      streamingPointBudget: 2_000_000,
      autoZoom: false,
      shareUrl: false,
      restoreFromUrl: false,
    });
    map.addControl(control);
    control
      .loadPointCloudStreaming(asset.href)
      .catch((cause: unknown) =>
        onError(
          cause instanceof Error
            ? cause.message
            : "The point cloud could not be opened.",
        ),
      );
    return () => {
      control.unloadPointCloud();
      map.removeControl(control);
    };
  }, [asset, maps, onError]);
  return null;
}
