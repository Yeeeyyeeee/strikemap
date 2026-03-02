"use client";

import { memo } from "react";
import { SirenAlertClient } from "@/hooks/useSirenPolling";

interface SirenBannerProps {
  alerts: SirenAlertClient[];
}

export default memo(function SirenBanner({ alerts }: SirenBannerProps) {
  if (alerts.length === 0) return null;

  const countries = [...new Set(alerts.map((a) => a.country))];
  const countryText = countries.join(", ");

  return (
    <div className="siren-banner fixed top-16 z-[45] pointer-events-none left-4 right-4 md:left-[17rem] md:right-[19rem] flex justify-center">
      <div className="siren-banner-inner pointer-events-auto px-6 py-3 rounded-lg border border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.3)] max-w-xl w-full text-center">
        <div className="flex items-center justify-center gap-2">
          <svg className="w-5 h-5 text-white shrink-0 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span
            className="text-sm font-bold uppercase tracking-wider text-white"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Sirens reported in {countryText} — take shelter
          </span>
          <svg className="w-5 h-5 text-white shrink-0 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <p className="text-[10px] text-white/50 mt-1">
          via Telegram{alerts.length > 1 ? ` (${alerts.length} reports)` : ""} &bull;{" "}
          {new Date(alerts[0].activatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
});
