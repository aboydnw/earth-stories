import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./mapCamera.js";

export function useFlyoverScroll(
  container: React.RefObject<HTMLElement | null>,
  keyframeCount: number,
  onProgress: (progress: number) => void,
) {
  const callback = useRef(onProgress);
  callback.current = onProgress;
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    let frame = 0;
    let current: number | null = null;
    let emitted: number | null = null;
    let lastStep = -1;
    const tick = () => {
      const node = container.current;
      if (node) {
        const rect = node.getBoundingClientRect();
        const distance = Math.max(1, rect.height - window.innerHeight);
        const target = Math.max(0, Math.min(1, -rect.top / distance));
        if (reduced) {
          const step = Math.round(target * Math.max(0, keyframeCount - 1));
          if (step !== lastStep) {
            lastStep = step;
            callback.current(
              keyframeCount > 1 ? step / (keyframeCount - 1) : 0,
            );
          }
        } else {
          current =
            current === null ? target : current + (target - current) * 0.12;
          if (Math.abs(target - current) < 0.0001) current = target;
          if (emitted === null || Math.abs(current - emitted) > 0.000001) {
            emitted = current;
            callback.current(current);
          }
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [container, keyframeCount, reduced]);
}
