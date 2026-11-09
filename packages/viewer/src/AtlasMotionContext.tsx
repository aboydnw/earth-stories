import { createContext } from "react";

/** The atlas clock is optional: other reader themes retain their own motion. */
export interface AtlasMotionState {
  chapterKey: string;
  active: boolean;
  progress: number;
  easedProgress: number;
  enabled: boolean;
  reducedMotion: boolean;
  paused: boolean;
  suspended: boolean;
  transitioning: boolean;
  running: boolean;
  interrupted: boolean;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  setEnabled: (enabled: boolean) => void;
  /** Yield the camera and timeline to the reader, without snapping to a target. */
  interrupt: () => void;
}

export const AtlasMotionContext = createContext<AtlasMotionState | null>(null);
