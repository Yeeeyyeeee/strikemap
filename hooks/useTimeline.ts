import { useEffect, useRef } from "react";

export function useTimeline({
  totalSteps,
  currentIndex,
  onIndexChange,
  isPlaying,
  speed,
}: {
  totalSteps: number;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isPlaying: boolean;
  speed: number;
}) {
  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;

  useEffect(() => {
    if (!isPlaying || totalSteps <= 1) return;

    const intervalMs = 2000 / speed;

    const id = setInterval(() => {
      const next = indexRef.current + 1;
      if (next >= totalSteps) {
        onIndexChange(totalSteps - 1);
      } else {
        onIndexChange(next);
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [isPlaying, speed, totalSteps, onIndexChange]);
}
