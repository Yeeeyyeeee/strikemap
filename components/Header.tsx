"use client";

import { memo, useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Incident, ViewMode } from "@/lib/types";
import { useI18n } from "@/lib/i18n/I18nContext";
import { type Locale } from "@/lib/i18n/translations";
import WidgetPicker from "./WidgetPicker";

interface HeaderProps {
  incidents: Incident[];
  /** Only used on the map page for strike filter sub-views */
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  activeAlertCount?: number;
  timelineActive?: boolean;
  onTimelineToggle?: () => void;
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  volume?: number;
  onVolumeChange?: (v: number) => void;
  notificationsEnabled?: boolean;
  onToggleNotifications?: () => void;
  chatOpen?: boolean;
  onToggleChat?: () => void;
  onToggleSuggestions?: () => void;
  onToggleChanges?: () => void;
  hasUnreadChat?: boolean;
  activeUsers?: number;
  onToggleWidgetPicker?: () => void;
  widgetPickerOpen?: boolean;
  activeWidgets?: string[];
  onAddWidget?: (id: string) => void;
  onRemoveWidget?: (id: string) => void;
  onResetWidgets?: () => void;
}

/** Dropdown wrapper that closes on outside click */
function Dropdown({ open, onClose, children, alignRight }: { open: boolean; onClose: () => void; children: React.ReactNode; alignRight?: boolean }) {
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
    <div ref={ref} className={`absolute top-full mt-1 z-50 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-1 shadow-lg min-w-[140px] ${alignRight ? "right-0" : "left-0"}`}>
      {children}
    </div>
  );
}

const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  fa: "فا",
  he: "עב",
  ar: "عر",
};

// Top-level tabs (flat)
const TABS: { path: string; label: string; activeClass: string }[] = [
  { path: "/", label: "strikes", activeClass: "bg-neutral-700 text-white" },
];

// Analytics dropdown — stats + leadership + briefing
const ANALYTICS_TABS: { path: string; label: string; activeClass: string }[] = [
  { path: "/stats", label: "stats", activeClass: "bg-green-500/20 text-green-400 border border-green-500/30" },
  { path: "/leadership", label: "leadership", activeClass: "bg-orange-500/20 text-orange-400 border border-orange-500/30" },
  { path: "/report", label: "Briefing", activeClass: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" },
];

const ANALYTICS_PATHS = new Set(ANALYTICS_TABS.map((t) => t.path));

// Recon dropdown — airspace + heatmap + satellite
const RECON_TABS: { path: string; label: string; activeClass: string }[] = [
  { path: "/airspace", label: "Airspace", activeClass: "bg-sky-500/20 text-sky-400 border border-sky-500/30" },
  { path: "/heatmap", label: "Heatmap", activeClass: "bg-amber-500/20 text-amber-400 border border-amber-500/30" },
];

const RECON_PATHS = new Set([...RECON_TABS.map((t) => t.path), "/satellite"]);

// Military sub-tabs (grouped under dropdown)
const MILITARY_TABS: { path: string; label: string; activeClass: string }[] = [
  { path: "/weapons", label: "weapons", activeClass: "bg-purple-500/20 text-purple-400 border border-purple-500/30" },
  { path: "/killchain", label: "killchain", activeClass: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" },
];

const MILITARY_PATHS = new Set(MILITARY_TABS.map((t) => t.path));

export default memo(function Header({
  incidents,
  viewMode = "all",
  onViewModeChange,
  activeAlertCount = 0,
  timelineActive = false,
  onTimelineToggle,
  settingsOpen = false,
  onToggleSettings,
  soundEnabled = true,
  onToggleSound,
  volume = 80,
  onVolumeChange,
  notificationsEnabled = true,
  onToggleNotifications,
  chatOpen = false,
  onToggleChat,
  onToggleSuggestions,
  onToggleChanges,
  hasUnreadChat = false,
  activeUsers = 0,
  onToggleWidgetPicker,
  widgetPickerOpen = false,
  activeWidgets = [],
  onAddWidget,
  onRemoveWidget,
  onResetWidgets,
}: HeaderProps) {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [strikesOpen, setStrikesOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [reconOpen, setReconOpen] = useState(false);
  const [militaryOpen, setMilitaryOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const isAnalyticsPage = ANALYTICS_PATHS.has(pathname);
  const isReconPage = RECON_PATHS.has(pathname);
  const isMilitaryPage = MILITARY_PATHS.has(pathname);
  const strikes = useMemo(() => incidents.filter((i) => !i.isStatement), [incidents]);
  const located = useMemo(() => strikes.filter((i) => i.lat !== 0 || i.lng !== 0), [strikes]);
  const unmappedCount = strikes.length - located.length;
  const { iranCount, usIsraelCount } = useMemo(() => ({
    iranCount: located.filter((i) => i.side === "iran").length,
    usIsraelCount: located.filter((i) => i.side === "us_israel" || i.side === "us" || i.side === "israel").length,
  }), [located]);

  const isHome = pathname === "/";
  const strikeLabel = viewMode === "iran" ? t("iranian") : viewMode === "us_israel" ? t("us_israel") : t("all");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a] border-b border-[#2a2a2a]">
      <div className="flex items-center justify-between px-2 md:px-6 h-14">
        {/* Left: logo + badges + controls */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Mobile back arrow on sub-pages */}
          {!isHome && (
            <Link
              href="/"
              className="md:hidden text-neutral-400 hover:text-white p-1 -ml-1 transition-colors"
              aria-label="Back to map"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
          )}
          <Link href="/">
            <h1
              className="text-base md:text-xl font-bold tracking-wider"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              <span className="text-red-500">STRIKE</span>
              <span className="text-neutral-300">MAP</span>
            </h1>
          </Link>
          <a
            href="https://buymeacoffee.com/strikemap"
            target="_blank"
            rel="noopener noreferrer"
            className="md:hidden flex items-center justify-center w-7 h-7 rounded-full bg-[#FFDD00]/15 border border-[#FFDD00]/30 text-[#FFDD00] hover:bg-[#FFDD00]/25 hover:border-[#FFDD00]/50 transition-all"
            title="Support the Project"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </a>
          <div className="flex items-center gap-1.5">
            <a
              href="https://t.me/strikemap"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#29B6F6]/15 border border-[#29B6F6]/30 text-[#29B6F6] hover:bg-[#29B6F6]/25 hover:border-[#29B6F6]/50 transition-all"
              title="Join our Telegram"
            >
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            </a>
            <a
              href="https://x.com/strikemaplive"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20 text-neutral-300 hover:bg-white/15 hover:border-white/30 transition-all"
              title="Follow on X"
            >
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a
              href="https://www.instagram.com/strike.map/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#E1306C]/15 border border-[#E1306C]/30 text-[#E1306C] hover:bg-[#E1306C]/25 hover:border-[#E1306C]/50 transition-all"
              title="Follow on Instagram"
            >
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            </a>
            <a
              href="https://discord.gg/h3rT4EbapJ"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#5865F2]/15 border border-[#5865F2]/30 text-[#5865F2] hover:bg-[#5865F2]/25 hover:border-[#5865F2]/50 transition-all"
              title="Join our Discord"
            >
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
            </a>
            <Link
              href="/report"
              className="md:hidden flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/25 hover:border-yellow-500/50 transition-all"
              title="Situation Briefing"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </Link>
            <a
              href="https://buymeacoffee.com/strikemap"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1 px-2 py-1 rounded-full bg-[#FFDD00]/15 border border-[#FFDD00]/30 text-[#FFDD00] hover:bg-[#FFDD00]/25 hover:border-[#FFDD00]/50 transition-all"
              title="Support the Project"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              <span className="text-[10px] font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>SUPPORT</span>
            </a>
          </div>
          <div className="hidden sm:flex items-center gap-2 ml-3">
            {activeUsers > 0 && (
              <span className="inline-flex items-center gap-1 bg-green-500/15 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-green-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {activeUsers}
              </span>
            )}
            {activeAlertCount > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-red-600/30 text-red-300 text-xs font-bold px-2.5 py-0.5 rounded-full border border-red-500/50 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {activeAlertCount} {t("incoming")}
              </span>
            )}
          </div>
          {/* Map-page controls (sound, notifications, share, settings) */}
          {isHome && (
            <div className="flex items-center gap-0.5 md:gap-2 ml-auto md:ml-2">
              {onToggleSound && (
                <div className="relative">
                  <button
                    onClick={() => setVolumeOpen((p) => !p)}
                    className={`relative transition-colors p-1.5 md:p-1 ${soundEnabled ? "text-neutral-500 hover:text-neutral-300" : "text-red-400 hover:text-red-300"}`}
                    title={soundEnabled ? "Volume" : "Sound muted"}
                  >
                    {!soundEnabled || volume === 0 ? (
                      <svg className="w-5 h-5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                    ) : volume < 50 ? (
                      <svg className="w-5 h-5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" /><path d="M15.54 8.46a5 5 0 010 7.07" /></svg>
                    ) : (
                      <svg className="w-5 h-5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" /><path d="M19.07 4.93a10 10 0 010 14.14" /><path d="M15.54 8.46a5 5 0 010 7.07" /></svg>
                    )}
                  </button>
                  <Dropdown open={volumeOpen} onClose={() => setVolumeOpen(false)} alignRight>
                    <div className="px-3 py-2 min-w-[160px]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider" style={{ fontFamily: "JetBrains Mono, monospace" }}>Volume</span>
                        <button
                          onClick={onToggleSound}
                          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors ${
                            soundEnabled ? "bg-neutral-800 text-neutral-400 hover:text-neutral-200" : "bg-red-500/20 text-red-400"
                          }`}
                          style={{ fontFamily: "JetBrains Mono, monospace" }}
                        >
                          {soundEnabled ? "Mute" : "Muted"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-3 h-3 text-neutral-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" /></svg>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={volume}
                          onChange={(e) => onVolumeChange?.(Number(e.target.value))}
                          className="flex-1 h-1 accent-red-500 bg-neutral-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500"
                        />
                        <svg className="w-3 h-3 text-neutral-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" /><path d="M19.07 4.93a10 10 0 010 14.14" /><path d="M15.54 8.46a5 5 0 010 7.07" /></svg>
                      </div>
                      <div className="text-center mt-1">
                        <span className="text-[9px] text-neutral-600" style={{ fontFamily: "JetBrains Mono, monospace" }}>{volume}%</span>
                      </div>
                    </div>
                  </Dropdown>
                </div>
              )}
              {onToggleNotifications && (
                <button
                  onClick={onToggleNotifications}
                  className={`relative transition-colors p-1.5 md:p-1 ${notificationsEnabled ? "text-neutral-500 hover:text-neutral-300" : "text-red-400 hover:text-red-300"}`}
                  title={notificationsEnabled ? "Disable notifications" : "Enable notifications"}
                >
                  {notificationsEnabled ? (
                    <svg className="w-5 h-5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
                  ) : (
                    <svg className="w-5 h-5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  )}
                </button>
              )}
              {onToggleSettings && (
                <button onClick={onToggleSettings} className={`transition-colors p-1.5 md:p-1 ${settingsOpen ? "text-red-400" : "text-neutral-500 hover:text-neutral-300"}`} title="Time Filter">
                  <svg className="w-5 h-5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                </button>
              )}
              {onToggleWidgetPicker && (
                <div className="relative hidden sm:block">
                  <button
                    onClick={onToggleWidgetPicker}
                    className={`transition-colors p-1.5 md:p-1 ${widgetPickerOpen ? "text-red-400" : "text-neutral-500 hover:text-neutral-300"}`}
                    title="Add/remove widgets"
                  >
                    <svg className="w-5 h-5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                  {onAddWidget && onRemoveWidget && onResetWidgets && (
                    <WidgetPicker
                      activeWidgets={activeWidgets}
                      onAdd={onAddWidget}
                      onRemove={onRemoveWidget}
                      onReset={onResetWidgets}
                      open={widgetPickerOpen}
                      onClose={onToggleWidgetPicker!}
                    />
                  )}
                </div>
              )}
              {onToggleChat && (
                <button onClick={onToggleChat} className={`relative transition-colors p-1.5 md:hidden ${chatOpen ? "text-red-400" : "text-neutral-500 hover:text-neutral-300"}`} title="Live Chat">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                  {hasUnreadChat && !chatOpen && (
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: nav tabs + language */}
        <div className="flex items-center gap-2">
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-0.5">
            {TABS.map((tab) => {
              const isActive = tab.path === "/" ? isHome : pathname === tab.path;

              // Strikes tab is special — has a dropdown for All/Iran/US-Israel
              if (tab.path === "/") {
                return (
                  <div key={tab.path} className="relative">
                    <button
                      onClick={() => {
                        if (!isHome) {
                          window.location.href = "/";
                        } else {
                          setStrikesOpen((p) => !p);
                        }
                      }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                        isActive ? tab.activeClass : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {t("strikes")}{isHome ? `: ${strikeLabel}` : ""}
                      {isHome && (
                        <svg className={`w-3 h-3 transition-transform ${strikesOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5l3 3 3-3" /></svg>
                      )}
                    </button>
                    {isHome && (
                      <Dropdown open={strikesOpen} onClose={() => setStrikesOpen(false)}>
                        <button onClick={() => { onViewModeChange?.("all"); setStrikesOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === "all" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"}`}>
                          {t("all")} ({strikes.length})
                        </button>
                        <button onClick={() => { onViewModeChange?.("iran"); setStrikesOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === "iran" ? "bg-red-500/20 text-red-400" : "text-neutral-400 hover:text-neutral-200"}`}>
                          {t("iranian")} ({iranCount})
                        </button>
                        <button onClick={() => { onViewModeChange?.("us_israel"); setStrikesOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === "us_israel" ? "bg-blue-500/20 text-blue-400" : "text-neutral-400 hover:text-neutral-200"}`}>
                          {t("us_israel")} ({usIsraelCount})
                        </button>
                        {onTimelineToggle && (
                          <button onClick={() => { onTimelineToggle(); setStrikesOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${timelineActive ? "bg-green-500/20 text-green-400" : "text-neutral-400 hover:text-neutral-200"}`}>
                            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5" /><path d="M8 4v4l2.5 2.5" strokeLinecap="round" /></svg>
                            {t("timeline")}
                          </button>
                        )}
                      </Dropdown>
                    )}
                  </div>
                );
              }

              // Translate label
              const label = t(tab.label as Parameters<typeof t>[0]);

              return (
                <Link
                  key={tab.path}
                  href={tab.path}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    isActive ? tab.activeClass : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {label}
                </Link>
              );
            })}

            {/* Analytics dropdown — Stats, Leadership */}
            <div className="relative">
              <button
                onClick={() => setAnalyticsOpen((p) => !p)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                  isAnalyticsPage ? "bg-green-500/20 text-green-400 border border-green-500/30" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                Analytics
                <svg className={`w-3 h-3 transition-transform ${analyticsOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5l3 3 3-3" /></svg>
              </button>
              <Dropdown open={analyticsOpen} onClose={() => setAnalyticsOpen(false)}>
                {ANALYTICS_TABS.map((sub) => {
                  const subActive = pathname === sub.path;
                  const subLabel = t(sub.label as Parameters<typeof t>[0]);
                  return (
                    <Link
                      key={sub.path}
                      href={sub.path}
                      onClick={() => setAnalyticsOpen(false)}
                      className={`block w-full text-left px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        subActive ? sub.activeClass : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      {subLabel}
                    </Link>
                  );
                })}
              </Dropdown>
            </div>

            {/* Recon dropdown — Airspace, Heatmap */}
            <div className="relative">
              <button
                onClick={() => setReconOpen((p) => !p)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                  isReconPage || (isHome && viewMode === "satellite") ? "bg-sky-500/20 text-sky-400 border border-sky-500/30" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                Recon
                <svg className={`w-3 h-3 transition-transform ${reconOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5l3 3 3-3" /></svg>
              </button>
              <Dropdown open={reconOpen} onClose={() => setReconOpen(false)}>
                {RECON_TABS.map((sub) => {
                  const subActive = pathname === sub.path;
                  return (
                    <Link
                      key={sub.path}
                      href={sub.path}
                      onClick={() => setReconOpen(false)}
                      className={`block w-full text-left px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        subActive ? sub.activeClass : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      {sub.label}
                    </Link>
                  );
                })}
                <button
                  onClick={() => {
                    setReconOpen(false);
                    if (!isHome) {
                      window.location.href = "/";
                    } else {
                      onViewModeChange?.(viewMode === "satellite" ? "all" : "satellite");
                    }
                  }}
                  className={`block w-full text-left px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    isHome && viewMode === "satellite" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  Satellite
                </button>
              </Dropdown>
            </div>

            {/* Military dropdown — Weapons, Kill Chain */}
            <div className="relative">
              <button
                onClick={() => setMilitaryOpen((p) => !p)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                  isMilitaryPage ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                Military
                <svg className={`w-3 h-3 transition-transform ${militaryOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5l3 3 3-3" /></svg>
              </button>
              <Dropdown open={militaryOpen} onClose={() => setMilitaryOpen(false)}>
                {MILITARY_TABS.map((sub) => {
                  const subActive = pathname === sub.path;
                  const subLabel = sub.label === "killchain" ? t("killchain") : t(sub.label as Parameters<typeof t>[0]);
                  return (
                    <Link
                      key={sub.path}
                      href={sub.path}
                      onClick={() => setMilitaryOpen(false)}
                      className={`block w-full text-left px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        subActive ? sub.activeClass : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      {subLabel}
                    </Link>
                  );
                })}
              </Dropdown>
            </div>

          </div>

          {/* Language selector dropdown — desktop only */}
          <div className="hidden md:block relative">
            <button
              onClick={() => setLangOpen((p) => !p)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[#1a1a1a] border border-[#2a2a2a] text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              {LOCALE_LABELS[locale]}
              <svg className={`w-3 h-3 transition-transform ${langOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5l3 3 3-3" /></svg>
            </button>
            <Dropdown open={langOpen} onClose={() => setLangOpen(false)}>
              {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
                <button
                  key={l}
                  onClick={() => { setLocale(l); setLangOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    locale === l ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </Dropdown>
          </div>
        </div>
      </div>
    </header>
  );
});
