"use client";

import { memo, useRef, useEffect } from "react";
import { WIDGET_REGISTRY, getBaseWidgetId } from "./widgetRegistry";

interface WidgetPickerProps {
  activeWidgets: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
  open: boolean;
  onClose: () => void;
}

export default memo(function WidgetPicker({
  activeWidgets,
  onAdd,
  onRemove,
  onReset,
  open,
  onClose,
}: WidgetPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 shadow-lg w-64"
    >
      <h3
        className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Widgets
      </h3>
      <div className="space-y-1">
        {WIDGET_REGISTRY.map((w) => {
          const instanceCount = activeWidgets.filter((aw) => getBaseWidgetId(aw) === w.id).length;
          const active = instanceCount > 0;
          const handleClick = () => {
            if (active) {
              // Remove ALL instances of this widget
              activeWidgets
                .filter((aw) => getBaseWidgetId(aw) === w.id)
                .forEach((aw) => onRemove(aw));
            } else {
              onAdd(w.id);
            }
          };
          return (
            <button
              key={w.id}
              onClick={handleClick}
              className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors flex items-center justify-between ${
                active
                  ? "bg-red-500/10 border border-red-500/30 text-neutral-300"
                  : "text-neutral-500 hover:text-neutral-300 hover:bg-[#222]"
              }`}
            >
              <div>
                <div
                  className="text-[11px] font-medium"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  {w.label}
                </div>
                <div className="text-[9px] text-neutral-600">{w.description}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {active && instanceCount > 1 && (
                  <span
                    className="text-[9px] font-bold text-red-400 bg-red-500/15 rounded px-1"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                  >
                    {instanceCount}
                  </span>
                )}
                {active && <span className="w-2 h-2 rounded-full bg-red-500" />}
              </div>
            </button>
          );
        })}
      </div>
      <button
        onClick={onReset}
        className="w-full mt-2 px-2 py-1.5 text-[10px] font-medium text-neutral-500 hover:text-neutral-300 bg-[#111] border border-[#2a2a2a] rounded-md transition-colors"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Reset Layout
      </button>
    </div>
  );
});
