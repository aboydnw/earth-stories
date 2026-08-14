import { useMemo } from "react";
import {
  publicationBasemapHref,
  type Camera,
  type PublicationManifest,
} from "@earth-stories/story-schema";
import { PublicationChapterRenderer } from "./PublicationChapterRenderer.js";
import { publicationRuntimePolicy } from "./publicationRuntime.js";

export interface FocusedChapterViewerProps {
  manifest: PublicationManifest;
  chapterId: string;
  interactiveMap?: boolean;
  fitRequestToken?: string | number;
  commitAutoFit?: boolean;
  onCameraChange?: (camera: Camera) => void;
  onFitAvailabilityChange?: (available: boolean) => void;
  onFitCameraChange?: (camera: Camera) => void;
  cameraOverride?: Camera | null;
}

export function FocusedChapterViewer({
  manifest,
  chapterId,
  interactiveMap = false,
  fitRequestToken,
  commitAutoFit = false,
  onCameraChange,
  onFitAvailabilityChange,
  onFitCameraChange,
  cameraOverride,
}: FocusedChapterViewerProps) {
  const assets = useMemo(
    () => new Map(manifest.assets.map((asset) => [asset.id, asset])),
    [manifest.assets],
  );
  const chapter = manifest.chapters.find(({ id }) => id === chapterId);
  const runtimePolicy = useMemo(
    () => publicationRuntimePolicy(manifest),
    [manifest],
  );
  if (!chapter)
    return (
      <div className="story-focused-state" role="status">
        This chapter is not available in the current preview.
      </div>
    );

  return (
    <main
      className={`story-publication story-publication--${manifest.publication.theme} story-publication--focused`}
    >
      <article className="story-chapters story-chapters--focused">
        <PublicationChapterRenderer
          chapter={chapter}
          assets={assets}
          basemapStyle={publicationBasemapHref(manifest.basemap)}
          runtimePolicy={runtimePolicy}
          composition={interactiveMap ? "authoring-map" : "focused-preview"}
          interactiveMap={interactiveMap}
          fitRequestToken={fitRequestToken}
          commitAutoFit={commitAutoFit}
          onCameraChange={onCameraChange}
          onFitAvailabilityChange={onFitAvailabilityChange}
          onFitCameraChange={onFitCameraChange}
          cameraOverride={cameraOverride}
        />
      </article>
    </main>
  );
}
