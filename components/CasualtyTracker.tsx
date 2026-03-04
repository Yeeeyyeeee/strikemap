"use client";

import { memo, useState, useEffect } from "react";

interface SideCasualties {
  killed: number;
  injured: number;
  military: number;
  civilian: number;
}

interface CasualtyData {
  iran: SideCasualties;
  usIsrael: SideCasualties;
  source: string;
  articles: string[];
}

export default memo(function CasualtyTracker() {
  const [data, setData] = useState<CasualtyData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/casualties")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d && !d.error) setData(d);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;

  const iranTotal = data.iran.killed;
  const usIsraelTotal = data.usIsrael.killed;
  const grandTotal = iranTotal + usIsraelTotal;

  if (grandTotal === 0) return null;

  return (
    <div className="w-full p-3">
      <h3
        className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2.5"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Casualties
      </h3>

      <div className="space-y-2.5">
        {iranTotal > 0 && (
          <CasualtyGroup
            label="Iranian"
            accent="#ef4444"
            killed={data.iran.killed}
            injured={data.iran.injured}
            military={data.iran.military}
            civilian={data.iran.civilian}
          />
        )}

        {usIsraelTotal > 0 && (
          <CasualtyGroup
            label="US / Israeli"
            accent="#3b82f6"
            killed={data.usIsrael.killed}
            injured={data.usIsrael.injured}
            military={data.usIsrael.military}
            civilian={data.usIsrael.civilian}
          />
        )}

        {/* Grand total */}
        <div className="flex justify-between border-t border-[#2a2a2a] pt-2">
          <span className="text-neutral-500 text-[11px]">Total killed</span>
          <span className="text-neutral-300 font-semibold font-mono text-[11px]">{grandTotal.toLocaleString()}</span>
        </div>

        {/* Source attribution */}
        <a
          href="https://en.wikipedia.org/wiki/2026_Iran_conflict"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] text-neutral-600 hover:text-neutral-400 transition-colors block text-right"
        >
          Source: Wikipedia
        </a>
      </div>
    </div>
  );
});

function CasualtyGroup({
  label,
  accent,
  killed,
  injured,
  military,
  civilian,
}: {
  label: string;
  accent: string;
  killed: number;
  injured: number;
  military: number;
  civilian: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-neutral-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: accent }} />
          {label}
        </span>
        <span className="text-[11px] font-semibold font-mono" style={{ color: accent }}>
          {killed.toLocaleString()}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
        {military > 0 && (
          <span className="flex items-center gap-1 text-neutral-500 shrink-0">
            <svg className="w-3 h-3 text-red-400/70 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
              <path d="M5 2l3-1 3 1" strokeLinecap="round" />
            </svg>
            <span className="text-red-400/80 font-mono whitespace-nowrap">{military.toLocaleString()}</span>
            <span>military</span>
          </span>
        )}
        {civilian > 0 && (
          <span className="flex items-center gap-1 text-neutral-500 shrink-0">
            <svg className="w-3 h-3 text-orange-400/70 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
            </svg>
            <span className="text-orange-400/80 font-mono whitespace-nowrap">{civilian.toLocaleString()}</span>
            <span>civilian</span>
          </span>
        )}
        {injured > 0 && (
          <span className="flex items-center gap-1 text-neutral-500 shrink-0">
            <span className="text-yellow-400/80 font-mono whitespace-nowrap">{injured.toLocaleString()}</span>
            <span>injured</span>
          </span>
        )}
      </div>
    </div>
  );
}
