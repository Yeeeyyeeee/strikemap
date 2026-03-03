"use client";

import { memo, useState } from "react";
import { MAP_STYLES } from "@/lib/mapStyles";

interface MapOverlayControlsProps {
  showBases: boolean;
  onToggleBases: () => void;
  showProxies: boolean;
  onToggleProxies: () => void;
  showFirms: boolean;
  onToggleFirms: () => void;
  firmsCount?: number;
  mapStyle?: string;
  onMapStyleChange?: (id: string) => void;
}

export default memo(function MapOverlayControls({
  showBases,
  onToggleBases,
  showProxies,
  onToggleProxies,
  showFirms,
  onToggleFirms,
  firmsCount = 0,
  mapStyle = "dark",
  onMapStyleChange,
}: MapOverlayControlsProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop controls — unchanged */}
      <div className="fixed top-[4.5rem] right-4 md:right-[19rem] z-40 hidden md:flex flex-col gap-2">
        <ToggleButton
          label="Bases"
          icon={<StarIcon />}
          active={showBases}
          onClick={onToggleBases}
          activeColor="#f97316"
        />
        <ToggleButton
          label="Proxies"
          icon={<TargetIcon />}
          active={showProxies}
          onClick={onToggleProxies}
          activeColor="#22c55e"
        />
        <ToggleButton
          label="Thermal"
          icon={<FlameIcon />}
          active={showFirms}
          onClick={onToggleFirms}
          activeColor="#f97316"
          badge={showFirms && firmsCount > 0 ? firmsCount : undefined}
        />
        {onMapStyleChange && (
          <div className="flex gap-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-0.5">
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
        {/* Strike type color key */}
        <div className="bg-[#1a1a1a]/90 border border-[#2a2a2a] rounded-lg px-3 py-2 space-y-1">
          <div className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider mb-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            Strike Type
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#ef4444" }} />
            <span className="text-[10px] text-neutral-400">Iranian Missile</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#a855f7" }} />
            <span className="text-[10px] text-neutral-400">Iranian Drone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#3b82f6" }} />
            <span className="text-[10px] text-neutral-400">US / Israeli Strike</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#22c55e" }} />
            <span className="text-[10px] text-neutral-400">Intercepted</span>
          </div>
          {showFirms && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#f97316" }} />
                <span className="text-[10px] text-neutral-400">Thermal Anomaly</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#ef4444" }} />
                <span className="text-[10px] text-neutral-400">Confirmed Strike Heat</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile FAB + expandable menu */}
      <div className="fixed top-[4.5rem] right-3 z-40 md:hidden">
        <button
          onClick={() => setMobileOpen((p) => !p)}
          className={`w-11 h-11 rounded-full flex items-center justify-center border shadow-lg transition-all ${
            mobileOpen
              ? "bg-neutral-700 border-neutral-600 text-white"
              : "bg-[#1a1a1a] border-[#2a2a2a] text-neutral-400"
          }`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
            <path d="M2 17l10 5 10-5" strokeLinejoin="round" />
            <path d="M2 12l10 5 10-5" strokeLinejoin="round" />
          </svg>
        </button>

        {mobileOpen && (
          <div className="mt-2 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
            <ToggleButton
              label="Bases"
              icon={<StarIcon />}
              active={showBases}
              onClick={onToggleBases}
              activeColor="#f97316"
            />
            <ToggleButton
              label="Proxies"
              icon={<TargetIcon />}
              active={showProxies}
              onClick={onToggleProxies}
              activeColor="#22c55e"
            />
            <ToggleButton
              label="Thermal"
              icon={<FlameIcon />}
              active={showFirms}
              onClick={onToggleFirms}
              activeColor="#f97316"
              badge={showFirms && firmsCount > 0 ? firmsCount : undefined}
            />
            {onMapStyleChange && (
              <div className="flex gap-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-1">
                {MAP_STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onMapStyleChange(s.id)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
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
        )}
      </div>
    </>
  );
});

function StarIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12,2 15,9 22,9 16.5,14 18.5,22 12,17.5 5.5,22 7.5,14 2,9 9,9" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="3" x2="12" y2="9" />
      <line x1="12" y1="15" x2="12" y2="21" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 23c-4.97 0-8-3.03-8-7 0-2.5 1.5-5 3-6.5.5-.5 1.5-.5 1.5.5 0 1.5.5 3 2 4 0-4 2-7 5.5-9.5.5-.5 1.5 0 1.5.5 0 3 1 5.5 2 7.5.5 1 1 2 1 3.5 0 3.97-3.03 7-8.5 7z" />
    </svg>
  );
}

function ToggleButton({
  label,
  icon,
  active,
  onClick,
  activeColor,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  activeColor: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 md:py-1.5 text-xs font-medium rounded-lg border transition-all ${
        active
          ? "text-white shadow-lg"
          : "bg-[#1a1a1a] border-[#2a2a2a] text-neutral-500 hover:text-neutral-300"
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
      {badge != null && badge > 0 && (
        <span
          className="ml-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{
            background: `${activeColor}30`,
            color: activeColor,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
