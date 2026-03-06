"use client";

import { memo, useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

interface LiveStream {
  id: string;
  label: string;
}

type Tab = "news" | "cam";

const MIN_HEIGHT_VH = 15;
const MAX_HEIGHT_VH = 90;
const DEFAULT_HEIGHT_VH = 40;

const MIN_WIDTH_PX = 400;
const DEFAULT_WIDTH_FRACTION = 1; // 1 = full width

export default memo(function LiveVideoPanel({
  open,
  onToggle,
  hideTrigger,
  desktopTriggerHidden,
}: {
  open: boolean;
  onToggle: () => void;
  hideTrigger?: boolean;
  desktopTriggerHidden?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("news");
  const [liveNews, setLiveNews] = useState<LiveStream[]>([]);
  const [liveCams, setLiveCams] = useState<LiveStream[]>([]);
  const [heightVh, setHeightVh] = useState(DEFAULT_HEIGHT_VH);
  const [widthPx, setWidthPx] = useState(0); // 0 = not yet initialized
  const [mounted, setMounted] = useState(false);

  // Vertical drag state
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVh = useRef(DEFAULT_HEIGHT_VH);

  // Horizontal drag state
  const hDragging = useRef<"left" | "right" | null>(null);
  const hStartX = useRef(0);
  const hStartWidth = useRef(0);

  useEffect(() => {
    setMounted(true);
    setWidthPx(window.innerWidth * DEFAULT_WIDTH_FRACTION);
    const onResize = () => setWidthPx((prev) => Math.min(prev, window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const fetchStreams = useCallback(async () => {
    try {
      const res = await fetch("/api/youtube-links");
      const data = await res.json();
      if (data.liveNews) setLiveNews(data.liveNews);
      if (data.liveCams) setLiveCams(data.liveCams);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStreams();
  }, [fetchStreams]);

  useEffect(() => {
    if (open) fetchStreams();
  }, [open, fetchStreams]);

  // ── Drag handling (mouse + touch) ──
  const onDragStart = useCallback((clientY: number) => {
    dragging.current = true;
    startY.current = clientY;
    startVh.current = heightVh;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
  }, [heightVh]);

  const onDragMove = useCallback((clientY: number) => {
    if (!dragging.current) return;
    const deltaY = startY.current - clientY;
    const deltaPct = (deltaY / window.innerHeight) * 100;
    const next = Math.min(MAX_HEIGHT_VH, Math.max(MIN_HEIGHT_VH, startVh.current + deltaPct));
    setHeightVh(next);
  }, []);

  const onDragEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  // ── Vertical drag mouse/touch bindings ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onDragStart(e.clientY);
  }, [onDragStart]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    onDragStart(e.touches[0].clientY);
  }, [onDragStart]);

  // ── Horizontal drag handlers ──
  const onHDragStart = useCallback((side: "left" | "right", clientX: number) => {
    hDragging.current = side;
    hStartX.current = clientX;
    hStartWidth.current = widthPx;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
  }, [widthPx]);

  const onHDragMove = useCallback((clientX: number) => {
    if (!hDragging.current) return;
    const deltaX = clientX - hStartX.current;
    // Dragging left edge left = wider, dragging right edge right = wider
    const multiplier = hDragging.current === "left" ? -2 : 2;
    const next = Math.min(window.innerWidth, Math.max(MIN_WIDTH_PX, hStartWidth.current + deltaX * multiplier));
    setWidthPx(next);
  }, []);

  const onHDragEnd = useCallback(() => {
    if (!hDragging.current) return;
    hDragging.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  const handleHMouseDown = useCallback((side: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    onHDragStart(side, e.clientX);
  }, [onHDragStart]);

  // ── Combined event listeners for both vertical and horizontal drag ──
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      onDragMove(e.clientY);
      onHDragMove(e.clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault();
      onDragMove(e.touches[0].clientY);
      onHDragMove(e.touches[0].clientX);
    };
    const onUp = () => {
      onDragEnd();
      onHDragEnd();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("touchcancel", onUp);
    };
  }, [onDragMove, onDragEnd, onHDragMove, onHDragEnd]);

  // Compute grid columns based on actual panel width
  const gridCols = widthPx < 500 ? 1 : widthPx < 900 ? 2 : widthPx < 1400 ? 3 : 4;

  const streams = tab === "news" ? liveNews : liveCams;

  if (!mounted) return null;

  const content = (
    <>
      {/* Trigger button — bottom center, hidden on mobile when chat is open */}
      {!open && (
        <button
          onClick={onToggle}
          style={{
            position: "fixed",
            bottom: "5rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            fontFamily: "JetBrains Mono, monospace",
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full border bg-[#1a1a1a] border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:shadow-[0_0_25px_rgba(239,68,68,0.35)] hover:bg-red-500/10 backdrop-blur-sm transition-all ${desktopTriggerHidden ? (hideTrigger ? "hidden" : "md:hidden") : (hideTrigger ? "hidden md:flex" : "")}`}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider">Live</span>
        </button>
      )}

      {/* Bottom sheet */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: widthPx > 0 ? `${widthPx}px` : "100vw",
            maxWidth: "100vw",
            height: `${heightVh}vh`,
            zIndex: 9999,
          }}
          className="flex flex-col bg-[#111] border-t border-[#2a2a2a] rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.5)] panel-enter"
        >
          {/* Left resize handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 group hidden md:block"
            onMouseDown={handleHMouseDown("left")}
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-neutral-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Right resize handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 group hidden md:block"
            onMouseDown={handleHMouseDown("right")}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-neutral-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Top drag handle */}
          <div
            className="shrink-0 cursor-ns-resize touch-none select-none"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            <div className="w-10 h-1 bg-neutral-600 rounded-full mx-auto mt-2 mb-1" />
          </div>

          {/* Header: tabs + close */}
          <div className="flex items-center justify-between px-3 pb-2 shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTab("news")}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors ${
                  tab === "news"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "text-neutral-500 hover:text-neutral-400"
                }`}
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                Live News
              </button>
              <button
                onClick={() => setTab("cam")}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors ${
                  tab === "cam"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "text-neutral-500 hover:text-neutral-400"
                }`}
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                Live Cam
              </button>
            </div>
            <button
              onClick={onToggle}
              className="text-neutral-500 hover:text-neutral-300 p-1.5 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 overscroll-contain min-h-0" style={{ WebkitOverflowScrolling: "touch" }}>
            {streams.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-neutral-600 text-sm">No streams available</p>
              </div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                {streams.map((stream, i) => (
                  <div key={stream.id} className="rounded-lg overflow-hidden bg-black">
                    <iframe
                      className="w-full aspect-video block"
                      src={`https://www.youtube.com/embed/${stream.id}?autoplay=${i === 0 ? 1 : 0}&mute=1`}
                      title={stream.label || `Stream ${i + 1}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      frameBorder="0"
                    />
                    {stream.label && (
                      <p
                        className="px-2 py-1 text-[10px] text-neutral-400 truncate"
                        style={{ fontFamily: "JetBrains Mono, monospace" }}
                      >
                        {stream.label}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  // Portal to document.body to escape any stacking context
  return createPortal(content, document.body);
});
