"use client";

import { memo, useMemo } from "react";
import { Incident } from "@/lib/types";

interface CasualtyTrackerProps {
  incidents: Incident[];
}

export default memo(function CasualtyTracker({ incidents }: CasualtyTrackerProps) {
  const stats = useMemo(() => {
    let totalMilitary = 0;
    let totalCivilian = 0;
    let iranMilitary = 0;
    let iranCivilian = 0;
    let usMilitary = 0;
    let usCivilian = 0;

    for (const i of incidents) {
      const mil = i.casualties_military || 0;
      const civ = i.casualties_civilian || 0;
      totalMilitary += mil;
      totalCivilian += civ;
      if (i.side === "iran") {
        iranMilitary += mil;
        iranCivilian += civ;
      } else {
        usMilitary += mil;
        usCivilian += civ;
      }
    }

    return { totalMilitary, totalCivilian, iranMilitary, iranCivilian, usMilitary, usCivilian };
  }, [incidents]);

  const total = stats.totalMilitary + stats.totalCivilian;
  const maxBar = Math.max(stats.totalMilitary, stats.totalCivilian, 1);
  const maxSide = Math.max(stats.iranMilitary + stats.iranCivilian, stats.usMilitary + stats.usCivilian, 1);

  return (
    <div className="bg-[#1a1a1a]/90 backdrop-blur-sm border border-[#2a2a2a] rounded-lg p-3 w-52">
      <h3
        className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Casualties
      </h3>

      {/* Military bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-neutral-500 flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
              <path d="M5 2l3-1 3 1" strokeLinecap="round" />
            </svg>
            Military
          </span>
          <span className="text-red-400 font-medium font-mono">{stats.totalMilitary}</span>
        </div>
        <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
          <div
            className="h-full bg-red-500 rounded-full transition-all duration-500"
            style={{ width: `${(stats.totalMilitary / maxBar) * 100}%` }}
          />
        </div>
      </div>

      {/* Civilian bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-neutral-500 flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
            </svg>
            Civilian
          </span>
          <span className="text-orange-400 font-medium font-mono">{stats.totalCivilian}</span>
        </div>
        <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all duration-500"
            style={{ width: `${(stats.totalCivilian / maxBar) * 100}%` }}
          />
        </div>
      </div>

      {/* Per-side death toll */}
      <div className="border-t border-[#2a2a2a] pt-2 space-y-2">
        <SideBreakdown
          label="Iran strikes"
          accent="#ef4444"
          military={stats.iranMilitary}
          civilian={stats.iranCivilian}
          maxVal={maxSide}
        />
        <SideBreakdown
          label="US/Israel strikes"
          accent="#3b82f6"
          military={stats.usMilitary}
          civilian={stats.usCivilian}
          maxVal={maxSide}
        />
        <div className="flex justify-between border-t border-[#2a2a2a] pt-1.5 mt-1.5">
          <span className="text-neutral-500 text-[11px]">Total killed</span>
          <span className="text-neutral-300 font-semibold font-mono text-[11px]">{total}</span>
        </div>
      </div>
    </div>
  );
});

function SideBreakdown({
  label,
  accent,
  military,
  civilian,
  maxVal,
}: {
  label: string;
  accent: string;
  military: number;
  civilian: number;
  maxVal: number;
}) {
  const sideTotal = military + civilian;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-neutral-500 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: accent }} />
          {label}
        </span>
        <span className="text-[11px] font-semibold font-mono" style={{ color: accent }}>
          {sideTotal}
        </span>
      </div>
      {/* Stacked bar */}
      <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden flex">
        {military > 0 && (
          <div
            className="h-full bg-red-500 transition-all duration-500"
            style={{ width: `${(military / maxVal) * 100}%` }}
          />
        )}
        {civilian > 0 && (
          <div
            className="h-full bg-orange-500 transition-all duration-500"
            style={{ width: `${(civilian / maxVal) * 100}%` }}
          />
        )}
      </div>
      <div className="flex items-center gap-3 mt-1 text-[10px] text-neutral-600">
        <span>{military} mil</span>
        <span>{civilian} civ</span>
      </div>
    </div>
  );
}
