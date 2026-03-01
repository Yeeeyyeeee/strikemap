"use client";

import { memo } from "react";
import { Incident } from "@/lib/types";

interface InterceptGaugeProps {
  incidents: Incident[];
}

interface SystemStats {
  name: string;
  intercepted: number;
  missed: number;
  total: number;
  rate: number;
}

const SYSTEM_COLORS: Record<string, string> = {
  "Iron Dome": "#22c55e",
  "Arrow-3": "#3b82f6",
  "Arrow-2": "#60a5fa",
  THAAD: "#a855f7",
  "David's Sling": "#f97316",
};

function getColor(pct: number): string {
  if (pct >= 80) return "#22c55e";
  if (pct >= 50) return "#eab308";
  return "#ef4444";
}

export default memo(function InterceptGauge({ incidents }: InterceptGaugeProps) {
  const withIntercept = incidents.filter(
    (i) => i.intercepted_by && i.intercepted_by.length > 0
  );

  if (withIntercept.length === 0) return null;

  // Group by defense system
  const systemMap = new Map<string, { intercepted: number; missed: number }>();
  for (const inc of withIntercept) {
    const sys = inc.intercepted_by!;
    const entry = systemMap.get(sys) || { intercepted: 0, missed: 0 };
    if (inc.intercept_success) {
      entry.intercepted++;
    } else {
      entry.missed++;
    }
    systemMap.set(sys, entry);
  }

  const systems: SystemStats[] = Array.from(systemMap.entries())
    .map(([name, { intercepted, missed }]) => ({
      name,
      intercepted,
      missed,
      total: intercepted + missed,
      rate: Math.round((intercepted / (intercepted + missed)) * 100),
    }))
    .sort((a, b) => b.total - a.total);

  const totalIntercepted = systems.reduce((s, sys) => s + sys.intercepted, 0);
  const totalAttempts = systems.reduce((s, sys) => s + sys.total, 0);
  const overallRate = totalAttempts > 0 ? Math.round((totalIntercepted / totalAttempts) * 100) : 0;

  return (
    <div className="bg-[#1a1a1a]/90 backdrop-blur-sm border border-[#2a2a2a] rounded-lg p-3 w-52">
      <h3
        className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Intercept Rate
      </h3>

      {/* Overall gauge */}
      <div className="relative h-2 bg-[#2a2a2a] rounded-full overflow-hidden mb-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${overallRate}%`, backgroundColor: getColor(overallRate) }}
        />
      </div>

      <div className="flex items-center justify-between mb-3">
        <span
          className="text-lg font-bold"
          style={{ color: getColor(overallRate), fontFamily: "JetBrains Mono, monospace" }}
        >
          {overallRate}%
        </span>
        <span className="text-[10px] text-neutral-500">
          {totalIntercepted}/{totalAttempts}
        </span>
      </div>

      {/* Per-system breakdown */}
      <div className="space-y-2">
        {systems.map((sys) => (
          <div key={sys.name}>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span style={{ color: SYSTEM_COLORS[sys.name] || "#999" }}>
                {sys.name}
              </span>
              <span className="text-neutral-400 font-medium">
                {sys.rate}%
              </span>
            </div>
            <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${sys.rate}%`,
                  backgroundColor: SYSTEM_COLORS[sys.name] || getColor(sys.rate),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
