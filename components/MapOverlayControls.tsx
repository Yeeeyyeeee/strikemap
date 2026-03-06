"use client";

import { memo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { MAP_STYLES } from "@/lib/mapStyles";

interface MapOverlayControlsProps {
  showBases: boolean;
  onToggleBases: () => void;
  showProxies: boolean;
  onToggleProxies: () => void;
  showFirms: boolean;
  onToggleFirms: () => void;
  showCountries?: boolean;
  onToggleCountries?: () => void;
  firmsCount?: number;
  showSeismic?: boolean;
  onToggleSeismic?: () => void;
  seismicCount?: number;
  showAircraft?: boolean;
  onToggleAircraft?: () => void;
  aircraftCount?: number;
  showVessels?: boolean;
  onToggleVessels?: () => void;
  vesselCount?: number;
  mapStyle?: string;
  onMapStyleChange?: (id: string) => void;
  onOpenChat?: () => void;
  hasUnreadChat?: boolean;
  hidden?: boolean;
}

export default memo(function MapOverlayControls({
  showBases,
  onToggleBases,
  showProxies,
  onToggleProxies,
  showFirms,
  onToggleFirms,
  showCountries = false,
  onToggleCountries,
  firmsCount = 0,
  showSeismic = false,
  onToggleSeismic,
  seismicCount = 0,
  showAircraft = false,
  onToggleAircraft,
  aircraftCount = 0,
  showVessels = false,
  onToggleVessels,
  vesselCount = 0,
  mapStyle = "dark",
  onMapStyleChange,
  onOpenChat,
  hasUnreadChat = false,
  hidden = false,
}: MapOverlayControlsProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || hidden) return null;

  return createPortal(
    <>
      {/* Mobile-only layers button — next to Live & Chat FABs */}
      <button
        onClick={() => setOpen((p) => !p)}
        className={`fixed md:hidden flex items-center gap-1.5 px-4 py-2.5 rounded-full border backdrop-blur-sm transition-all ${
          open
            ? "bg-neutral-700 border-neutral-500 text-white shadow-[0_0_15px_rgba(163,163,163,0.2)]"
            : "bg-[#1a1a1a] border-[#2a2a2a] text-neutral-400 hover:text-neutral-300"
        }`}
        style={{ zIndex: 9998, bottom: "5rem", right: "calc(50% + 52px)", fontFamily: "JetBrains Mono, monospace" }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
          <path d="M2 17l10 5 10-5" strokeLinejoin="round" />
          <path d="M2 12l10 5 10-5" strokeLinejoin="round" />
        </svg>
        <span className="text-xs font-bold uppercase tracking-wider">Layers</span>
      </button>

      {/* Mobile layers drop-up panel — pinned to right edge */}
      {open && (
        <div className="fixed right-2 md:hidden flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150 max-h-[calc(100vh-200px)] overflow-y-auto" style={{ zIndex: 9998, bottom: "8rem" }}>
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
          {onToggleSeismic && (
            <ToggleButton
              label="Seismic"
              icon={<SeismicIcon />}
              active={showSeismic}
              onClick={onToggleSeismic}
              activeColor="#eab308"
              badge={showSeismic && seismicCount > 0 ? seismicCount : undefined}
            />
          )}
          {onToggleAircraft && (
            <ToggleButton
              label="Aircraft"
              icon={<PlaneIcon />}
              active={showAircraft}
              onClick={onToggleAircraft}
              activeColor="#00ff88"
              badge={showAircraft && aircraftCount > 0 ? aircraftCount : undefined}
            />
          )}
          {onToggleVessels && (
            <ToggleButton
              label="Vessels"
              icon={<AnchorIcon />}
              active={showVessels}
              onClick={onToggleVessels}
              activeColor="#38bdf8"
              badge={showVessels && vesselCount > 0 ? vesselCount : undefined}
            />
          )}
          {onToggleCountries && (
            <ToggleButton
              label="Borders"
              icon={<BordersIcon />}
              active={showCountries}
              onClick={onToggleCountries}
              activeColor="#8b5cf6"
            />
          )}
          {onOpenChat && (
            <button
              onClick={onOpenChat}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all bg-[#1a1a1a] border-[#2a2a2a] text-neutral-400 hover:text-white hover:border-[#3b82f6]/50 hover:bg-[#3b82f6]/10 relative"
            >
              <ChatIcon />
              Live Chat
              {hasUnreadChat && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>
          )}
          {onMapStyleChange && (
            <div className="flex gap-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-1">
              {MAP_STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onMapStyleChange(s.id)}
                  className={`px-2.5 py-1.5 text-[10px] font-medium rounded-md transition-colors ${
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
            {showSeismic && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#eab308" }} />
                  <span className="text-[10px] text-neutral-400">Seismic Event</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#22c55e" }} />
                  <span className="text-[10px] text-neutral-400">Seismic Strike Match</span>
                </div>
              </>
            )}
            {showAircraft && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#00ff88" }} />
                <span className="text-[10px] text-neutral-400">Military Aircraft</span>
              </div>
            )}
            {showVessels && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#ff4444" }} />
                  <span className="text-[10px] text-neutral-400">Military Vessel</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#f59e0b" }} />
                  <span className="text-[10px] text-neutral-400">Tanker</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#8b5cf6" }} />
                  <span className="text-[10px] text-neutral-400">Cargo</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#38bdf8" }} />
                  <span className="text-[10px] text-neutral-400">Other Vessel</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>,
    document.body,
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

function SeismicIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,12 5,12 7,6 10,18 13,8 16,14 18,12 22,12" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BordersIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  );
}

function PlaneIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2 1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

function AnchorIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3" />
      <line x1="12" y1="22" x2="12" y2="8" />
      <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
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
