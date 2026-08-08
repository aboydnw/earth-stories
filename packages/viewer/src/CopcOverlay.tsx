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
    let moveEndHandler: (() => void) | null = null;
    let readyFallback: number | null = null;
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
        if (!active) {
          control.unloadPointCloud(pointCloud.id);
          return;
        }
        if (!autoFit) {
          onReady?.();
          return;
        }
        const finishReady = () => {
          if (readyFallback !== null) window.clearTimeout(readyFallback);
          readyFallback = null;
          if (moveEndHandler) map.off("moveend", moveEndHandler);
          moveEndHandler = null;
          if (active) onReady?.();
        };
        moveEndHandler = finishReady;
        map.once("moveend", moveEndHandler);
        control.flyToPointCloud(pointCloud.id);
        readyFallback = window.setTimeout(finishReady, 1_250);
      })
      .catch((cause: unknown) => {
        if (!active) {
          control.unloadPointCloud();
          return;
        }
        onError(
          cause instanceof Error
            ? cause.message
            : "The point cloud could not be opened.",
        );
      });
    return () => {
      active = false;
      if (readyFallback !== null) window.clearTimeout(readyFallback);
      if (moveEndHandler) map.off("moveend", moveEndHandler);
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
