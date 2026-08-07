import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { LidarControl, type PointCloudInfo } from "maplibre-gl-lidar";
import "maplibre-gl-lidar/style.css";
import type { PublicationAsset } from "@earth-stories/story-schema";

export function CopcOverlay({
  asset,
  map,
  onError,
  onReady,
  autoFit = false,
}: {
  asset: PublicationAsset;
  map: MapLibreMap | null;
  onError: (message: string) => void;
  onReady?: () => void;
  autoFit?: boolean;
}) {
  useEffect(() => {
    let active = true;
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
      .then((pointCloud: PointCloudInfo) => {
        if (!active) return;
        if (autoFit) control.flyToPointCloud(pointCloud.id);
        onReady?.();
      })
      .catch(
        (cause: unknown) =>
          active &&
          onError(
            cause instanceof Error
              ? cause.message
              : "The point cloud could not be opened.",
          ),
      );
    return () => {
      active = false;
      control.unloadPointCloud();
      map.removeControl(control);
    };
  }, [
    asset.href,
    asset.kind,
    asset.copc?.colorMode,
    asset.copc?.pointSize,
    map,
    onError,
    onReady,
    autoFit,
  ]);
  return null;
}
