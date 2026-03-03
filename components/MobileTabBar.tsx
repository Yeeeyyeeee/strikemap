"use client";

import { memo } from "react";

export type MobileTab = "map" | "feed" | "stats" | "alerts" | "menu";

interface MobileTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  alertCount?: number;
}

export default memo(function MobileTabBar({ activeTab, onTabChange, alertCount = 0 }: MobileTabBarProps) {
  const toggle = (tab: MobileTab) => {
    // Tapping the active tab returns to map
    onTabChange(activeTab === tab ? "map" : tab);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[55] md:hidden bg-[#0a0a0a] border-t border-[#2a2a2a] safe-area-bottom">
      <div className="flex items-center h-14">
        <TabButton
          icon={<MapIcon />}
          label="Map"
          active={activeTab === "map"}
          onClick={() => onTabChange("map")}
        />
        <TabButton
          icon={<FeedIcon />}
          label="Feed"
          active={activeTab === "feed"}
          onClick={() => toggle("feed")}
        />
        <TabButton
          icon={<StatsIcon />}
          label="Stats"
          active={activeTab === "stats"}
          onClick={() => toggle("stats")}
        />
        <TabButton
          icon={<AlertIcon />}
          label="Alerts"
          active={activeTab === "alerts"}
          onClick={() => toggle("alerts")}
          badge={alertCount > 0 ? alertCount : undefined}
        />
        <TabButton
          icon={<MenuIcon />}
          label="More"
          active={activeTab === "menu"}
          onClick={() => toggle("menu")}
        />
      </div>
    </nav>
  );
});

function TabButton({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors relative ${
        active ? "text-red-400" : "text-neutral-500 active:text-neutral-300"
      }`}
    >
      <span className="relative">
        {icon}
        {badge !== undefined && (
          <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[7px] font-bold text-white flex items-center justify-center ring-2 ring-[#0a0a0a]">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span
        className="text-[9px] font-semibold uppercase tracking-wider"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        {label}
      </span>
    </button>
  );
}

function MapIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" strokeLinejoin="round" />
      <path d="M8 2v16M16 6v16" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 8h6M7 12h4" strokeLinecap="round" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
