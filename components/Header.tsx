"use client";

import { useState } from "react";
import { Incident, ViewMode } from "@/lib/types";
import { useI18n } from "@/lib/i18n/I18nContext";
import { type Locale } from "@/lib/i18n/translations";

interface HeaderProps {
  incidents: Incident[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  activeAlertCount?: number;
  timelineActive?: boolean;
  onTimelineToggle?: () => void;
  onShare?: () => void;
  shareCopied?: boolean;
  notificationPermission?: NotificationPermission;
  onRequestNotifications?: () => void;
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  notificationsEnabled?: boolean;
  onToggleNotifications?: () => void;
}

const isMapView = (mode: ViewMode) =>
  !["leadership", "stats", "weapons", "killchain"].includes(mode);

const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  fa: "فا",
  he: "עב",
  ar: "عر",
};

export default function Header({
  incidents,
  viewMode,
  onViewModeChange,
  activeAlertCount = 0,
  timelineActive = false,
  onTimelineToggle,
  onShare,
  shareCopied = false,
  notificationPermission,
  onRequestNotifications,
  settingsOpen = false,
  onToggleSettings,
  soundEnabled = true,
  onToggleSound,
  notificationsEnabled = true,
  onToggleNotifications,
}: HeaderProps) {
  const { t, locale, setLocale } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const iranCount = incidents.filter((i) => i.side === "iran").length;
  const usIsraelCount = incidents.filter((i) => i.side === "us_israel" || i.side === "us" || i.side === "israel").length;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-[#2a2a2a]">
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        <div className="flex items-center gap-3">
          <h1
            className="text-lg md:text-xl font-bold tracking-wider"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            <span className="text-red-500">STRIKE</span>
            <span className="text-neutral-300">MAP</span>
          </h1>
          <div className="hidden sm:flex items-center gap-2 ml-3">
            <span className="bg-red-500/20 text-red-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-red-500/30">
              {incidents.length} {t("strikes")}
            </span>
            {activeAlertCount > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-red-600/30 text-red-300 text-xs font-bold px-2.5 py-0.5 rounded-full border border-red-500/50 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                {activeAlertCount} {t("incoming")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-2">
            {/* Sound mute/unmute toggle */}
            {onToggleSound && (
              <button
                onClick={onToggleSound}
                className={`relative transition-colors p-1 ${soundEnabled ? "text-neutral-500 hover:text-neutral-300" : "text-red-400 hover:text-red-300"}`}
                title={soundEnabled ? "Mute sounds" : "Unmute sounds"}
              >
                {soundEnabled ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                    <path d="M19.07 4.93a10 10 0 010 14.14" />
                    <path d="M15.54 8.46a5 5 0 010 7.07" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                )}
              </button>
            )}
            {/* Notifications toggle */}
            {onToggleNotifications && (
              <button
                onClick={onToggleNotifications}
                className={`relative transition-colors p-1 ${notificationsEnabled ? "text-neutral-500 hover:text-neutral-300" : "text-red-400 hover:text-red-300"}`}
                title={notificationsEnabled ? "Disable notifications" : "Enable notifications"}
              >
                {notificationsEnabled ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 01-3.46 0" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 01-3.46 0" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            )}
            {onShare && (
              <button
                onClick={onShare}
                className={`transition-colors p-1 ${shareCopied ? "text-green-400" : "text-neutral-500 hover:text-neutral-300"}`}
                title={shareCopied ? t("copied") : t("share")}
              >
                {shareCopied ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                    <polyline points="16,6 12,2 8,6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                )}
              </button>
            )}
            {onToggleSettings && (
              <button
                onClick={onToggleSettings}
                className={`transition-colors p-1 ${settingsOpen ? "text-red-400" : "text-neutral-500 hover:text-neutral-300"}`}
                title="Settings"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Hamburger button — mobile only */}
          <button
            onClick={() => setMenuOpen((p) => !p)}
            className="md:hidden p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors"
            aria-label="Menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>

          {/* View toggle — desktop */}
          <div className="hidden md:flex items-center gap-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-0.5">
            <button
              onClick={() => onViewModeChange("all")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "all"
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t("all")} ({incidents.length})
            </button>
            <button
              onClick={() => onViewModeChange("iran")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "iran"
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t("iranian")} ({iranCount})
            </button>
            <button
              onClick={() => onViewModeChange("us_israel")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "us_israel"
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t("us_israel")} ({usIsraelCount})
            </button>
            <div className="w-px h-4 bg-[#2a2a2a]" />
            <button
              onClick={() => onViewModeChange("leadership")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "leadership"
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t("leadership")}
            </button>
            <button
              onClick={() => onViewModeChange("stats")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "stats"
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t("stats")}
            </button>
            <button
              onClick={() => onViewModeChange("weapons")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "weapons"
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t("weapons")}
            </button>
            <button
              onClick={() => onViewModeChange("killchain")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "killchain"
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t("killchain")}
            </button>
            {isMapView(viewMode) && onTimelineToggle && (
              <>
                <div className="w-px h-4 bg-[#2a2a2a]" />
                <button
                  onClick={onTimelineToggle}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    timelineActive
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="8" cy="8" r="6.5" />
                    <path d="M8 4v4l2.5 2.5" strokeLinecap="round" />
                  </svg>
                  {t("timeline")}
                </button>
              </>
            )}
          </div>

          {/* Language selector */}
          <div className="flex items-center gap-0.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-0.5">
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
                  locale === l
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden bg-[#0a0a0a]/95 backdrop-blur-md border-b border-[#2a2a2a] px-4 py-3 flex flex-col gap-2">
          <button
            onClick={() => { onViewModeChange("all"); setMenuOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors ${
              viewMode === "all"
                ? "bg-neutral-700 text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t("all")} ({incidents.length})
          </button>
          <button
            onClick={() => { onViewModeChange("iran"); setMenuOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors ${
              viewMode === "iran"
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t("iranian")} ({iranCount})
          </button>
          <button
            onClick={() => { onViewModeChange("us_israel"); setMenuOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors ${
              viewMode === "us_israel"
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t("us_israel")} ({usIsraelCount})
          </button>
          <div className="h-px bg-[#2a2a2a]" />
          <button
            onClick={() => { onViewModeChange("leadership"); setMenuOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors ${
              viewMode === "leadership"
                ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t("leadership")}
          </button>
          <button
            onClick={() => { onViewModeChange("stats"); setMenuOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors ${
              viewMode === "stats"
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t("stats")}
          </button>
          <button
            onClick={() => { onViewModeChange("weapons"); setMenuOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors ${
              viewMode === "weapons"
                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t("weapons")}
          </button>
          <button
            onClick={() => { onViewModeChange("killchain"); setMenuOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors ${
              viewMode === "killchain"
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t("killchain")}
          </button>
          {isMapView(viewMode) && onTimelineToggle && (
            <>
              <div className="h-px bg-[#2a2a2a]" />
              <button
                onClick={() => { onTimelineToggle(); setMenuOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                  timelineActive
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M8 4v4l2.5 2.5" strokeLinecap="round" />
                </svg>
                {t("timeline")}
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
}
