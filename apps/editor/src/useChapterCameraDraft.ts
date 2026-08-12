import { useCallback, useEffect, useRef, useState } from "react";
import type { Camera } from "@earth-stories/story-schema";

export type ChapterCameraStatus = "idle" | "changed" | "updated";

function angleDistance(left: number, right: number) {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

export function camerasEqual(left: Camera, right: Camera) {
  return (
    Math.abs(left.center[0] - right.center[0]) <= 0.00001 &&
    Math.abs(left.center[1] - right.center[1]) <= 0.00001 &&
    Math.abs(left.zoom - right.zoom) <= 0.0001 &&
    angleDistance(left.bearing, right.bearing) <= 0.001 &&
    Math.abs(left.pitch - right.pitch) <= 0.001 &&
    left.globe === right.globe &&
    left.buildings === right.buildings &&
    left.terrain?.enabled === right.terrain?.enabled &&
    left.terrain?.exaggeration === right.terrain?.exaggeration
  );
}

export function useChapterCameraDraft({
  chapterId,
  camera,
  savedCamera,
  onCommit,
  delay = 700,
}: {
  chapterId: string;
  camera: Camera;
  savedCamera: Camera;
  onCommit: (camera: Camera) => void;
  delay?: number;
}) {
  const [liveCamera, setLiveCamera] = useState(camera);
  const [status, setStatus] = useState<ChapterCameraStatus>("idle");
  const [undoCamera, setUndoCamera] = useState<Camera | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionStartRef = useRef<Camera | null>(null);
  const liveCameraRef = useRef(camera);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const cancelPending = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    interactionStartRef.current = null;
  }, []);

  useEffect(() => {
    cancelPending();
    liveCameraRef.current = camera;
    setLiveCamera(camera);
    setStatus("idle");
    setUndoCamera(null);
  }, [chapterId, cancelPending]);

  useEffect(() => {
    if (timerRef.current || camerasEqual(liveCameraRef.current, camera)) return;
    liveCameraRef.current = camera;
    setLiveCamera(camera);
    setStatus("idle");
    setUndoCamera(null);
  }, [
    camera.center[0],
    camera.center[1],
    camera.zoom,
    camera.bearing,
    camera.pitch,
    camera.globe,
    camera.buildings,
    camera.terrain?.enabled,
    camera.terrain?.exaggeration,
  ]);

  useEffect(() => cancelPending, [cancelPending]);

  const onUserCameraChange = useCallback(
    (next: Camera) => {
      if (camerasEqual(liveCameraRef.current, next)) return;
      if (!interactionStartRef.current)
        interactionStartRef.current = liveCameraRef.current;
      liveCameraRef.current = next;
      setLiveCamera(next);
      setStatus("changed");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const before = interactionStartRef.current;
        interactionStartRef.current = null;
        timerRef.current = null;
        if (before) setUndoCamera(before);
        onCommitRef.current(liveCameraRef.current);
        setStatus("updated");
      }, delay);
    },
    [delay],
  );

  const undo = useCallback(() => {
    if (!undoCamera) return;
    cancelPending();
    liveCameraRef.current = undoCamera;
    setLiveCamera(undoCamera);
    setUndoCamera(null);
    setStatus("updated");
    onCommitRef.current(undoCamera);
  }, [cancelPending, undoCamera]);

  const resetToSaved = useCallback(() => {
    cancelPending();
    liveCameraRef.current = savedCamera;
    setLiveCamera(savedCamera);
    setUndoCamera(null);
    setStatus("updated");
    onCommitRef.current(savedCamera);
  }, [cancelPending, savedCamera]);

  const applyProgrammaticCamera = useCallback(
    (next: Camera) => {
      if (camerasEqual(liveCameraRef.current, next)) return;
      cancelPending();
      setUndoCamera(liveCameraRef.current);
      liveCameraRef.current = next;
      setLiveCamera(next);
      setStatus("updated");
      onCommitRef.current(next);
    },
    [cancelPending],
  );

  return {
    camera: liveCamera,
    status,
    canUndo: undoCamera !== null,
    onUserCameraChange,
    applyProgrammaticCamera,
    undo,
    resetToSaved,
  };
}
