"use client";

import { memo, useRef, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";

const GRID = 16; // snap grid size in px
const snap = (v: number) => Math.round(v / GRID) * GRID;

interface FloatingWidgetProps {
  id: string;
  title: string;
  position: { x: number; y: number };
  width: number;
  height?: number;
  onPositionChange: (id: string, pos: { x: number; y: number }) => void;
  onClose: (id: string) => void;
  onResize?: (id: string, width: number, height?: number) => void;
  onFocus: (id: string) => void;
  onDuplicate?: () => void;
  zIndex: number;
  resizable?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  minimizable?: boolean;
  children: React.ReactNode;
}

export default memo(function FloatingWidget({
  id,
  title,
  position,
  width,
  height,
  onPositionChange,
  onClose,
  onResize,
  onFocus,
  onDuplicate,
  zIndex,
  resizable = false,
  minWidth = 180,
  maxWidth = 640,
  minHeight = 100,
  maxHeight = 2000,
  minimizable = true,
  children,
}: FloatingWidgetProps) {
  const [mounted, setMounted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Drag refs
  const moving = useRef(false);
  const moveStartX = useRef(0);
  const moveStartY = useRef(0);
  const moveStartPos = useRef({ x: 0, y: 0 });

  // Resize refs
  const resizing = useRef(false);
  const resizeCorner = useRef<"tl" | "tr" | "bl" | "br" | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartY = useRef(0);
  const resizeStartW = useRef(width);
  const resizeStartH = useRef(height ?? 0);
  const resizeStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => setMounted(true), []);

  // Move handlers
  const onMoveStart = useCallback(
    (clientX: number, clientY: number) => {
      moving.current = true;
      moveStartX.current = clientX;
      moveStartY.current = clientY;
      moveStartPos.current = { ...position };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      onFocus(id);
    },
    [position, onFocus, id]
  );

  // Resize handlers
  const onResizeStart = useCallback(
    (clientX: number, clientY: number, corner: "tl" | "tr" | "bl" | "br") => {
      resizing.current = true;
      resizeCorner.current = corner;
      resizeStartX.current = clientX;
      resizeStartY.current = clientY;
      resizeStartW.current = width;
      resizeStartH.current = height ?? 0;
      resizeStartPos.current = { ...position };
      document.body.style.userSelect = "none";
      document.body.style.cursor =
        corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize";
      onFocus(id);
    },
    [width, height, position, onFocus, id]
  );

  useEffect(() => {
    const clampAndSnap = (rawX: number, rawY: number) => {
      const cx = Math.max(0, Math.min(window.innerWidth - 100, rawX));
      const cy = Math.max(56, Math.min(window.innerHeight - 50, rawY));
      return { x: snap(cx), y: snap(cy) };
    };

    const applyResize = (rawDx: number, rawDy: number) => {
      if (!cardRef.current) return;
      const corner = resizeCorner.current;
      const startW = resizeStartW.current;
      const startH = resizeStartH.current;
      const startP = resizeStartPos.current;

      // Compute new width based on corner direction
      const dxSign = corner === "tl" || corner === "bl" ? -1 : 1;
      const dySign = corner === "tl" || corner === "tr" ? -1 : 1;

      const nw = snap(Math.min(maxWidth, Math.max(minWidth, startW + rawDx * dxSign)));
      cardRef.current.style.width = `${nw}px`;

      // Adjust left when dragging from left corners
      if (corner === "tl" || corner === "bl") {
        const newLeft = startP.x + (startW - nw);
        cardRef.current.style.left = `${newLeft}px`;
      }

      if (startH > 0) {
        let nh = snap(Math.min(maxHeight, Math.max(minHeight, startH + rawDy * dySign)));

        // When resizing from top corners, clamp so widget can't go above the header (56px)
        if (corner === "tl" || corner === "tr") {
          const newTop = startP.y + (startH - nh);
          if (newTop < 56) {
            nh = startH + startP.y - 56;
            nh = snap(Math.max(minHeight, nh));
          }
        }

        const contentEl = cardRef.current.querySelector("[data-widget-content]") as HTMLElement | null;
        if (contentEl) contentEl.style.height = `${nh}px`;

        // Adjust top when dragging from top corners
        if (corner === "tl" || corner === "tr") {
          const newTop = Math.max(56, startP.y + (startH - nh));
          cardRef.current.style.top = `${newTop}px`;
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (moving.current && cardRef.current) {
        const dx = e.clientX - moveStartX.current;
        const dy = e.clientY - moveStartY.current;
        const { x, y } = clampAndSnap(moveStartPos.current.x + dx, moveStartPos.current.y + dy);
        cardRef.current.style.left = `${x}px`;
        cardRef.current.style.top = `${y}px`;
      }
      if (resizing.current && cardRef.current) {
        const rawDx = e.clientX - resizeStartX.current;
        const rawDy = e.clientY - resizeStartY.current;
        applyResize(rawDx, rawDy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (moving.current || resizing.current) e.preventDefault();
      const t = e.touches[0];
      if (moving.current && cardRef.current) {
        const dx = t.clientX - moveStartX.current;
        const dy = t.clientY - moveStartY.current;
        const { x, y } = clampAndSnap(moveStartPos.current.x + dx, moveStartPos.current.y + dy);
        cardRef.current.style.left = `${x}px`;
        cardRef.current.style.top = `${y}px`;
      }
      if (resizing.current && cardRef.current) {
        const rawDx = t.clientX - resizeStartX.current;
        const rawDy = t.clientY - resizeStartY.current;
        applyResize(rawDx, rawDy);
      }
    };

    const onUp = () => {
      if (moving.current && cardRef.current) {
        moving.current = false;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        const left = parseInt(cardRef.current.style.left) || position.x;
        const top = parseInt(cardRef.current.style.top) || position.y;
        onPositionChange(id, { x: snap(left), y: snap(top) });
      }
      if (resizing.current && cardRef.current) {
        const corner = resizeCorner.current;
        resizing.current = false;
        resizeCorner.current = null;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        const w = parseInt(cardRef.current.style.width) || width;
        const contentEl = cardRef.current.querySelector("[data-widget-content]") as HTMLElement | null;
        const h = contentEl ? parseInt(contentEl.style.height) || undefined : undefined;
        onResize?.(id, snap(w), h ? snap(h) : undefined);
        // Persist position if origin moved (tl/bl/tr corners)
        if (corner && corner !== "br") {
          const left = parseInt(cardRef.current.style.left) || position.x;
          const top = parseInt(cardRef.current.style.top) || position.y;
          onPositionChange(id, { x: snap(left), y: snap(top) });
        }
      }
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
  }, [id, position, width, height, minWidth, maxWidth, minHeight, maxHeight, onPositionChange, onResize]);

  if (!mounted) return null;

  const card = (
    <div
      ref={cardRef}
      className="hidden md:block"
      style={{
        position: "fixed",
        left: position.x,
        top: Math.max(56, position.y),
        width,
        zIndex,
        transition: moving.current ? undefined : "left 0.1s ease, top 0.1s ease",
      }}
      onMouseDown={() => onFocus(id)}
    >
      <div className="relative bg-[#1a1a1a]/95 border border-[#2a2a2a] rounded-lg overflow-hidden">
        {/* Resize handles — all 4 corners (on outer card so top corners cover header) */}
        {resizable && !minimized && (
          <>
            {(["tl", "tr", "bl", "br"] as const).map((corner) => {
              const isTop = corner[0] === "t";
              const isLeft = corner[1] === "l";
              const cursor = corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize";
              return (
                <div
                  key={corner}
                  className="absolute w-4 h-4 touch-none group"
                  style={{
                    cursor,
                    zIndex: 10,
                    top: isTop ? 0 : undefined,
                    bottom: isTop ? undefined : 0,
                    left: isLeft ? 0 : undefined,
                    right: isLeft ? undefined : 0,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onResizeStart(e.clientX, e.clientY, corner);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    onResizeStart(e.touches[0].clientX, e.touches[0].clientY, corner);
                  }}
                >
                  {corner === "br" && (
                    <svg
                      className="w-3 h-3 absolute bottom-0.5 right-0.5 text-neutral-600 group-hover:text-neutral-400 transition-colors"
                      viewBox="0 0 10 10"
                      fill="currentColor"
                    >
                      <circle cx="8" cy="8" r="1.2" />
                      <circle cx="4" cy="8" r="1.2" />
                      <circle cx="8" cy="4" r="1.2" />
                    </svg>
                  )}
                </div>
              );
            })}
          </>
        )}
        {/* Header — drag handle */}
        <div
          className="flex items-center justify-between px-2 py-1.5 border-b border-[#2a2a2a]/50 cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            e.preventDefault();
            onMoveStart(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => onMoveStart(e.touches[0].clientX, e.touches[0].clientY)}
        >
          <div className="flex items-center gap-1.5 pointer-events-none">
            <span
              className="text-[10px] font-bold uppercase tracking-wider text-neutral-500"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {title}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            {onDuplicate && (
              <button
                onClick={onDuplicate}
                className="text-neutral-600 hover:text-green-400 transition-colors p-0.5"
                onMouseDown={(e) => e.stopPropagation()}
                title="Add another instance"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
            {minimizable && (
              <button
                onClick={() => setMinimized((p) => !p)}
                className="text-neutral-600 hover:text-neutral-400 transition-colors p-0.5"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <svg
                  className={`w-3 h-3 transition-transform ${minimized ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            <button
              onClick={() => onClose(id)}
              className="text-neutral-600 hover:text-red-400 transition-colors p-0.5"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        {!minimized && (
          <div className="relative" data-widget-content style={height ? { height, overflow: "hidden" } : undefined}>
            {children}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(card, document.body);
});
