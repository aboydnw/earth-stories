import { type ReactNode, useEffect, useRef, useState } from "react";

export function StoryMapHydrationBoundary({
  children,
  fallback,
  eager = false,
}: {
  children: ReactNode;
  fallback: ReactNode;
  eager?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = useState(eager);

  useEffect(() => {
    if (eager) {
      setHydrated(true);
      return;
    }
    if (hydrated) return;
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setHydrated(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setHydrated(true);
        observer.disconnect();
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager, hydrated]);

  return (
    <div className="story-map-boundary" ref={root}>
      {hydrated ? children : fallback}
    </div>
  );
}
