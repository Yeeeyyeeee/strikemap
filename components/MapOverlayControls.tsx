"use client";

import { memo } from "react";
import { MAP_STYLES } from "@/lib/mapStyles";

interface MapOverlayControlsProps {
  showBases: boolean;
  onToggleBases: () => void;
  showProxies: boolean;
  onToggleProxies: () => void;
  mapStyle?: string;
  onMapStyleChange?: (id: string) => void;
}

export default memo(function MapOverlayControls({
  showBases,
  onToggleBases,
  showProxies,
  onToggleProxies,
  mapStyle = "dark",
  onMapStyleChange,
}: MapOverlayControlsProps) {
  return (
    <div className="fixed top-[4.5rem] right-4 md:right-[19rem] z-40 flex flex-col gap-2">
      <ToggleButton
        label="Bases"
        icon={
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12,2 15,9 22,9 16.5,14 18.5,22 12,17.5 5.5,22 7.5,14 2,9 9,9" />
          </svg>
        }
        active={showBases}
        onClick={onToggleBases}
        activeColor="#f97316"
      />
      <ToggleButton
        label="Proxies"
        icon={
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="3" x2="12" y2="9" />
            <line x1="12" y1="15" x2="12" y2="21" />
          </svg>
        }
        active={showProxies}
        onClick={onToggleProxies}
        activeColor="#22c55e"
      />
      {onMapStyleChange && (
        <div className="flex gap-1 bg-[#1a1a1a]/80 backdrop-blur-sm border border-[#2a2a2a] rounded-lg p-0.5">
          {MAP_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => onMapStyleChange(s.id)}
              className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
                mapStyle === s.id
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

function ToggleButton({
  label,
  icon,
  active,
  onClick,
  activeColor,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
        active
          ? "text-white shadow-lg"
          : "bg-[#1a1a1a]/80 border-[#2a2a2a] text-neutral-500 hover:text-neutral-300 backdrop-blur-sm"
      }`}
      style={
        active
          ? {
              background: `${activeColor}20`,
              borderColor: `${activeColor}50`,
              color: activeColor,
            }
          : undefined
      }
    >
      {icon}
      {label}
    </button>
  );
}
