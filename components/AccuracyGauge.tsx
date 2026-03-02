"use client";

import { memo } from "react";
import { Incident, StrikeSide } from "@/lib/types";

interface AccuracyGaugeProps {
  incidents: Incident[];
  side: StrikeSide;
}

const SIDE_CONFIG: Record<string, { label: string; accent: string }> = {
  iran: { label: "Iran Aim Accuracy", accent: "#ef4444" },
  us_israel: { label: "US/Israel Aim Accuracy", accent: "#3b82f6" },
  us: { label: "US Aim Accuracy", accent: "#3b82f6" },
  israel: { label: "Israel Aim Accuracy", accent: "#06b6d4" },
};

export default memo(function AccuracyGauge({ incidents, side }: AccuracyGaugeProps) {
  const matchesSide = (i: Incident) => {
    if (side === "us_israel") return i.side === "us_israel" || i.side === "us" || i.side === "israel";
    return i.side === side;
  };
  const UNKNOWN_TYPES = ["", "unknown", "undetermined", "unspecified"];
  const isClassified = (i: Incident) => {
    const t = (i.target_type || "").toLowerCase().trim();
    return !UNKNOWN_TYPES.includes(t) && !t.startsWith("unspecified");
  };

  const strikes = incidents.filter(
    (i) => matchesSide(i) && i.lat !== 0 && i.lng !== 0 && isClassified(i)
  );

  if (strikes.length === 0) return null;

  const militaryHits = strikes.filter((i) => i.target_military).length;
  const civilianHits = strikes.filter((i) => !i.target_military).length;
  const total = strikes.length;
  const accuracy = Math.round((militaryHits / total) * 100);

  const getColor = (pct: number) => {
    if (pct >= 70) return "#22c55e";
    if (pct >= 40) return "#eab308";
    return "#ef4444";
  };

  const getLabel = (pct: number) => {
    if (pct >= 70) return "HIGH";
    if (pct >= 40) return "MODERATE";
    return "LOW";
  };

  const color = getColor(accuracy);
  const config = SIDE_CONFIG[side];

  return (
    <div className="bg-[#1a1a1a]/95 border border-[#2a2a2a] rounded-lg p-3 w-52">
      <h3
        className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        <span style={{ color: config.accent }}>
          {side === "iran" ? "IRAN" : "US/ISR"}
        </span>{" "}
        Aim Accuracy
      </h3>

      {/* Gauge bar */}
      <div className="relative h-2 bg-[#2a2a2a] rounded-full overflow-hidden mb-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${accuracy}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex items-center justify-between mb-3">
        <span
          className="text-lg font-bold"
          style={{ color, fontFamily: "JetBrains Mono, monospace" }}
        >
          {accuracy}%
        </span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{
            color,
            backgroundColor: `${color}20`,
            border: `1px solid ${color}30`,
          }}
        >
          {getLabel(accuracy)}
        </span>
      </div>

      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-neutral-500">Military targets</span>
          <span className="text-green-400 font-medium">{militaryHits}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Civilian targets</span>
          <span className="text-red-400 font-medium">{civilianHits}</span>
        </div>
        <div className="flex justify-between border-t border-[#2a2a2a] pt-1 mt-1">
          <span className="text-neutral-500">Total strikes</span>
          <span className="text-neutral-300 font-medium">{total}</span>
        </div>
      </div>
    </div>
  );
});
