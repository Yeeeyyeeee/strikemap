"use client";

import { memo, useCallback, useRef } from "react";

interface TimelineProps {
  allSlots: string[];
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

function formatHourSlot(hourKey: string): string {
  if (!hourKey) return "\u2014";
  // "2026-03-01T14" → "Mar 1 — 14:00"
  const m = hourKey.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/);
  if (!m) return hourKey;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${datePart} \u2014 ${m[4]}:00`;
}

export default memo(function Timeline({
  allSlots,
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

  const maxIndex = Math.max(allSlots.length - 1, 0);
  const percentage = maxIndex > 0 ? (currentIndex / maxIndex) * 100 : 100;
  const currentSlot = allSlots[currentIndex] ?? "";

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

  const cycleSpeed = useCallback(() => {
    const idx = SPEEDS.indexOf(speed);
    onSpeedChange(SPEEDS[(idx + 1) % SPEEDS.length]);
  }, [speed, onSpeedChange]);

  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] w-[min(28rem,calc(100vw-2rem))]"
      style={{ fontFamily: "JetBrains Mono, monospace" }}
    >
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl shadow-2xl shadow-black/50 px-4 py-3">
        {/* Top: date + counter + close */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-red-400 text-[9px] font-bold uppercase tracking-widest shrink-0">
              REPLAY
            </span>
            <span className="text-neutral-300 text-xs truncate">
              {currentSlot ? formatHourSlot(currentSlot) : "\u2014"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-neutral-600 text-[10px]">
              {visibleCount}/{totalIncidents}
            </span>
            <button
              onClick={onClose}
              className="text-neutral-600 hover:text-neutral-300 transition-colors text-xs leading-none"
            >
              \u2715
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div
          ref={trackRef}
          className="timeline-track mb-3"
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

        {/* Controls: skip back, play/pause, skip forward, speed */}
        <div className="flex items-center justify-center gap-3">
          {/* Skip back */}
          <button
            onClick={stepBack}
            disabled={currentIndex === 0}
            className="w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-200 disabled:text-neutral-700 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
              <path d="M8 1L3 6l5 5V1z" />
              <rect x="1" y="1" width="2" height="10" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            onClick={onPlayPause}
            className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center transition-colors shadow-lg shadow-red-500/20"
          >
            {isPlaying ? (
              <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
                <rect x="1" y="0" width="3.5" height="14" rx="1" />
                <rect x="7.5" y="0" width="3.5" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="12" height="14" viewBox="0 0 12 14" fill="white" className="ml-0.5">
                <path d="M1 0.5L11 7L1 13.5V0.5z" />
              </svg>
            )}
          </button>

          {/* Skip forward */}
          <button
            onClick={stepForward}
            disabled={currentIndex >= maxIndex}
            className="w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-200 disabled:text-neutral-700 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
              <path d="M4 1l5 5-5 5V1z" />
              <rect x="9" y="1" width="2" height="10" />
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-[#2a2a2a] mx-1" />

          {/* Speed toggle */}
          <button
            onClick={cycleSpeed}
            className="px-2 py-1 text-[10px] rounded-md bg-[#2a2a2a] text-neutral-400 hover:text-neutral-200 transition-colors min-w-[2.5rem] text-center"
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
});
