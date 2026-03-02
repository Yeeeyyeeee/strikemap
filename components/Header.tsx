"use client";

import { memo, useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Incident, ViewMode } from "@/lib/types";
import { useI18n } from "@/lib/i18n/I18nContext";
import { type Locale } from "@/lib/i18n/translations";

interface HeaderProps {
  incidents: Incident[];
  /** Only used on the map page for strike filter sub-views */
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  activeAlertCount?: number;
  timelineActive?: boolean;
  onTimelineToggle?: () => void;
  onShare?: () => void;
  shareCopied?: boolean;
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  notificationsEnabled?: boolean;
  onToggleNotifications?: () => void;
}

/** Dropdown wrapper that closes on outside click */
function Dropdown({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
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
    <div ref={ref} className="absolute top-full left-0 mt-1 z-50 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-1 shadow-lg min-w-[140px]">
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
  { path: "/leadership", label: "leadership", activeClass: "bg-orange-500/20 text-orange-400 border border-orange-500/30" },
  { path: "/stats", label: "stats", activeClass: "bg-green-500/20 text-green-400 border border-green-500/30" },
  { path: "/airspace", label: "airspace", activeClass: "bg-sky-500/20 text-sky-400 border border-sky-500/30" },
  { path: "/heatmap", label: "heatmap", activeClass: "bg-amber-500/20 text-amber-400 border border-amber-500/30" },
];

// Military sub-tabs (grouped under dropdown)
const MILITARY_TABS: { path: string; label: string; activeClass: string }[] = [
  { path: "/weapons", label: "weapons", activeClass: "bg-purple-500/20 text-purple-400 border border-purple-500/30" },
  { path: "/killchain", label: "killchain", activeClass: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" },
  { path: "/intercept", label: "intercept", activeClass: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" },
];

const MILITARY_PATHS = new Set(MILITARY_TABS.map((t) => t.path));

export default memo(function Header({
  incidents,
  viewMode = "all",
  onViewModeChange,
  activeAlertCount = 0,
  timelineActive = false,
  onTimelineToggle,
  onShare,
  shareCopied = false,
  settingsOpen = false,
  onToggleSettings,
  soundEnabled = true,
  onToggleSound,
  notificationsEnabled = true,
  onToggleNotifications,
}: HeaderProps) {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [strikesOpen, setStrikesOpen] = useState(false);
  const [militaryOpen, setMilitaryOpen] = useState(false);
  const isMilitaryPage = MILITARY_PATHS.has(pathname);
  const { iranCount, usIsraelCount } = useMemo(() => ({
    iranCount: incidents.filter((i) => i.side === "iran").length,
    usIsraelCount: incidents.filter((i) => i.side === "us_israel" || i.side === "us" || i.side === "israel").length,
  }), [incidents]);

  const isHome = pathname === "/";
  const strikeLabel = viewMode === "iran" ? t("iranian") : viewMode === "us_israel" ? t("us_israel") : t("all");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a] border-b border-[#2a2a2a]">
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        {/* Left: logo + badges + controls */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <h1
              className="text-lg md:text-xl font-bold tracking-wider"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              <span className="text-red-500">STRIKE</span>
              <span className="text-neutral-300">MAP</span>
            </h1>
          </Link>
          <a
            href="https://t.me/strikemap"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#29B6F6]/15 border border-[#29B6F6]/30 text-[#29B6F6] hover:bg-[#29B6F6]/25 hover:border-[#29B6F6]/50 transition-all"
            title="Join our Telegram"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            <span className="text-[10px] font-semibold hidden sm:inline">JOIN</span>
          </a>
          <div className="hidden sm:flex items-center gap-2 ml-3">
            <span className="bg-red-500/20 text-red-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-red-500/30">
              {incidents.length} {t("strikes")}
            </span>
            {activeAlertCount > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-red-600/30 text-red-300 text-xs font-bold px-2.5 py-0.5 rounded-full border border-red-500/50 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {activeAlertCount} {t("incoming")}
              </span>
            )}
          </div>
          {/* Map-page controls (sound, notifications, share, settings) */}
          {isHome && (
            <div className="flex items-center gap-2 ml-2">
              {onToggleSound && (
                <button
                  onClick={onToggleSound}
                  className={`relative transition-colors p-1 ${soundEnabled ? "text-neutral-500 hover:text-neutral-300" : "text-red-400 hover:text-red-300"}`}
                  title={soundEnabled ? "Mute sounds" : "Unmute sounds"}
                >
                  {soundEnabled ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" /><path d="M19.07 4.93a10 10 0 010 14.14" /><path d="M15.54 8.46a5 5 0 010 7.07" /></svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                  )}
                </button>
              )}
              {onToggleNotifications && (
                <button
                  onClick={onToggleNotifications}
                  className={`relative transition-colors p-1 ${notificationsEnabled ? "text-neutral-500 hover:text-neutral-300" : "text-red-400 hover:text-red-300"}`}
                  title={notificationsEnabled ? "Disable notifications" : "Enable notifications"}
                >
                  {notificationsEnabled ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  )}
                </button>
              )}
              {onShare && (
                <button onClick={onShare} className={`transition-colors p-1 ${shareCopied ? "text-green-400" : "text-neutral-500 hover:text-neutral-300"}`} title={shareCopied ? t("copied") : t("share")}>
                  {shareCopied ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12" /></svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16,6 12,2 8,6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                  )}
                </button>
              )}
              {onToggleSettings && (
                <button onClick={onToggleSettings} className={`transition-colors p-1 ${settingsOpen ? "text-red-400" : "text-neutral-500 hover:text-neutral-300"}`} title="Settings">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: nav tabs + language */}
        <div className="flex items-center gap-2">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen((p) => !p)}
            className="md:hidden p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors"
            aria-label="Menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            )}
          </button>

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
                          {t("all")} ({incidents.length})
                        </button>
                        <button onClick={() => { onViewModeChange?.("iran"); setStrikesOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === "iran" ? "bg-red-500/20 text-red-400" : "text-neutral-400 hover:text-neutral-200"}`}>
                          {t("iranian")} ({iranCount})
                        </button>
                        <button onClick={() => { onViewModeChange?.("us_israel"); setStrikesOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === "us_israel" ? "bg-blue-500/20 text-blue-400" : "text-neutral-400 hover:text-neutral-200"}`}>
                          {t("us_israel")} ({usIsraelCount})
                        </button>
                      </Dropdown>
                    )}
                  </div>
                );
              }

              // Translate label — "airspace" doesn't have a translation key, use raw
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

            {/* Military dropdown — Weapons, Kill Chain, Intercept */}
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

            {/* Timeline — only on map page */}
            {isHome && onTimelineToggle && (
              <>
                <div className="w-px h-4 bg-[#2a2a2a]" />
                <button
                  onClick={onTimelineToggle}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    timelineActive ? "bg-green-500/20 text-green-400 border border-green-500/30" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5" /><path d="M8 4v4l2.5 2.5" strokeLinecap="round" /></svg>
                  {t("timeline")}
                </button>
              </>
            )}
          </div>

          {/* Language selector */}
          <div className="flex items-center gap-0.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-0.5">
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
              <button key={l} onClick={() => setLocale(l)} className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${locale === l ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-neutral-300"}`}>
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-[#0a0a0a] border-b border-[#2a2a2a] px-4 py-3 flex flex-col gap-2">
          {TABS.map((tab) => {
            const isActive = tab.path === "/" ? isHome : pathname === tab.path;
            const label = tab.label === "strikes" ? `${t("strikes")} (${incidents.length})` : tab.label === "airspace" ? "Airspace" : t(tab.label as Parameters<typeof t>[0]);
            return (
              <Link
                key={tab.path}
                href={tab.path}
                onClick={() => setMenuOpen(false)}
                className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors block ${
                  isActive ? tab.activeClass : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {label}
              </Link>
            );
          })}
          {/* Military section */}
          <div className="h-px bg-[#2a2a2a]" />
          <span className="text-[10px] text-neutral-600 uppercase tracking-wider px-3 font-semibold" style={{ fontFamily: "JetBrains Mono, monospace" }}>Military</span>
          {MILITARY_TABS.map((tab) => {
            const isActive = pathname === tab.path;
            const label = tab.label === "killchain" ? t("killchain") : t(tab.label as Parameters<typeof t>[0]);
            return (
              <Link
                key={tab.path}
                href={tab.path}
                onClick={() => setMenuOpen(false)}
                className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors block ${
                  isActive ? tab.activeClass : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {label}
              </Link>
            );
          })}
          {isHome && onTimelineToggle && (
            <>
              <div className="h-px bg-[#2a2a2a]" />
              <button
                onClick={() => { onTimelineToggle(); setMenuOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                  timelineActive ? "bg-green-500/20 text-green-400 border border-green-500/30" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {t("timeline")}
              </button>
            </>
          )}
          {/* Telegram CTA in mobile menu */}
          <div className="h-px bg-[#2a2a2a]" />
          <a
            href="https://t.me/strikemap"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md text-[#29B6F6] hover:bg-[#29B6F6]/10 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            Join our Telegram
          </a>
        </div>
      )}
    </header>
  );
});
