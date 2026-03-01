"use client";

import { useCallback, useRef } from "react";

interface TimelineProps {
  allDates: string[];
  currentIndex: number;
  totalIncidents: number;
  visibleCount: number;
  isPlaying: boolean;
  speed: number;
  onIndexChange: (index: number) => void;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onClose: () => void;
}

const SPEEDS = [1, 2, 5, 10];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Timeline({
  allDates,
  currentIndex,
  totalIncidents,
  visibleCount,
  isPlaying,
  speed,
  onIndexChange,
  onPlayPause,
  onSpeedChange,
  onClose,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const maxIndex = Math.max(allDates.length - 1, 0);
  const percentage = maxIndex > 0 ? (currentIndex / maxIndex) * 100 : 100;
  const currentDate = allDates[currentIndex] ?? "";

  const indexFromPointer = useCallback(
    (clientX: number) => {
      if (!trackRef.current || maxIndex === 0) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * maxIndex);
    },
    [maxIndex]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      onIndexChange(indexFromPointer(e.clientX));
    },
    [indexFromPointer, onIndexChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      onIndexChange(indexFromPointer(e.clientX));
    },
    [indexFromPointer, onIndexChange]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const stepBack = useCallback(() => {
    onIndexChange(Math.max(0, currentIndex - 1));
  }, [currentIndex, onIndexChange]);

  const stepForward = useCallback(() => {
    onIndexChange(Math.min(maxIndex, currentIndex + 1));
  }, [currentIndex, maxIndex, onIndexChange]);

  const firstDate = allDates[0] ?? "";
  const lastDate = allDates[allDates.length - 1] ?? "";

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[45] bg-[#0a0a0a]/95 backdrop-blur-md border-t border-[#2a2a2a] px-6 py-4"
      style={{ fontFamily: "JetBrains Mono, monospace" }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-4 text-neutral-500 hover:text-neutral-300 transition-colors text-sm"
      >
        ✕
      </button>

      {/* Top row: date + counter */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-red-400 text-xs font-semibold uppercase tracking-wider">
            REPLAY
          </span>
          <span className="text-neutral-300 text-sm">
            {currentDate ? formatDate(currentDate) : "—"}
          </span>
        </div>
        <span className="text-neutral-500 text-xs">
          {visibleCount} of {totalIncidents} strikes shown
        </span>
      </div>

      {/* Slider */}
      <div
        ref={trackRef}
        className="timeline-track mb-2"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          className="timeline-fill"
          style={{ width: `${percentage}%` }}
        />
        <div
          className="timeline-thumb"
          style={{ left: `${percentage}%` }}
        />
      </div>

      {/* Date range labels */}
      <div className="flex justify-between mb-3">
        <span className="text-neutral-600 text-[10px]">
          {firstDate ? formatDate(firstDate) : ""}
        </span>
        <span className="text-neutral-600 text-[10px]">
          {lastDate ? formatDate(lastDate) : ""}
        </span>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Playback controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={stepBack}
            disabled={currentIndex === 0}
            className="w-7 h-7 flex items-center justify-center rounded text-neutral-400 hover:text-neutral-200 disabled:text-neutral-700 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M8 1L3 6l5 5V1z" />
              <rect x="1" y="1" width="2" height="10" />
            </svg>
          </button>

          <button
            onClick={onPlayPause}
            className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
          >
            {isPlaying ? (
              <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
                <rect x="1" y="0" width="3.5" height="14" rx="1" />
                <rect x="7.5" y="0" width="3.5" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
                <path d="M1 0.5L11 7L1 13.5V0.5z" />
              </svg>
            )}
          </button>

          <button
            onClick={stepForward}
            disabled={currentIndex >= maxIndex}
            className="w-7 h-7 flex items-center justify-center rounded text-neutral-400 hover:text-neutral-200 disabled:text-neutral-700 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M4 1l5 5-5 5V1z" />
              <rect x="9" y="1" width="2" height="10" />
            </svg>
          </button>
        </div>

        {/* Speed controls */}
        <div className="flex items-center gap-1">
          <span className="text-neutral-600 text-[10px] mr-1.5 uppercase tracking-wider">
            Speed
          </span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                speed === s
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
