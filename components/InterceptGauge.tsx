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
  unknown: number;
  total: number;
  rate: number;
}

export const SYSTEM_COLORS: Record<string, string> = {
  "Iron Dome": "#22c55e",
  "Arrow-3": "#3b82f6",
  "Arrow-2": "#60a5fa",
  THAAD: "#a855f7",
  "David's Sling": "#f97316",
  "S-300": "#ef4444",
  "Bavar-373": "#f43f5e",
  "Khordad-15": "#e11d48",
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
  const systemMap = new Map<string, { intercepted: number; missed: number; unknown: number; projectilesFired: number; projectilesIntercepted: number }>();
  for (const inc of withIntercept) {
    const sys = inc.intercepted_by!;
    const entry = systemMap.get(sys) || { intercepted: 0, missed: 0, unknown: 0, projectilesFired: 0, projectilesIntercepted: 0 };
    if (inc.intercept_success === true) {
      entry.intercepted++;
    } else if (inc.intercept_success === false) {
      entry.missed++;
    } else {
      entry.unknown++;
    }
    if (inc.missiles_fired) entry.projectilesFired += inc.missiles_fired;
    if (inc.missiles_intercepted) entry.projectilesIntercepted += inc.missiles_intercepted;
    systemMap.set(sys, entry);
  }

  const systems: SystemStats[] = Array.from(systemMap.entries())
    .map(([name, { intercepted, missed, unknown }]) => {
      const confirmed = intercepted + missed;
      return {
        name,
        intercepted,
        missed,
        unknown,
        total: intercepted + missed + unknown,
        rate: confirmed > 0 ? Math.round((intercepted / confirmed) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Use missiles_fired/missiles_intercepted when available, otherwise count incidents
  let totalProjectiles = 0;
  let totalIntercepted = 0;
  for (const inc of withIntercept) {
    totalProjectiles += inc.missiles_fired || 1;
    totalIntercepted += inc.missiles_intercepted || (inc.intercept_success === true ? 1 : 0);
  }
  const totalConfirmedIncidents = systems.reduce((s, sys) => s + sys.intercepted + sys.missed, 0);
  const totalInterceptedIncidents = systems.reduce((s, sys) => s + sys.intercepted, 0);
  const totalUnknown = systems.reduce((s, sys) => s + sys.unknown, 0);
  const overallRate = totalConfirmedIncidents > 0 ? Math.round((totalInterceptedIncidents / totalConfirmedIncidents) * 100) : 0;

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
          {totalInterceptedIncidents}/{totalConfirmedIncidents}
        </span>
      </div>

      {/* Per-system breakdown */}
      <div className="space-y-2">
        {systems.map((sys) => (
          <div key={sys.name}>
            <div className="flex items-center justify-between text-[11px] mb-0.5">
              <div className="flex items-center gap-1">
                {sys.intercepted > 0 && (
                  <span className="text-green-400 text-[9px]" title="Intercepted">&#x2713;</span>
                )}
                {sys.missed > 0 && (
                  <span className="text-red-400 text-[9px]" title="Missed">&#x2717;</span>
                )}
                {sys.unknown > 0 && (
                  <span className="text-neutral-500 text-[9px]" title="Unconfirmed">?</span>
                )}
                <span style={{ color: SYSTEM_COLORS[sys.name] || "#999" }}>
                  {sys.name}
                </span>
              </div>
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

      {/* Unknown/unconfirmed row */}
      {totalUnknown > 0 && (
        <div className="mt-2 pt-2 border-t border-[#2a2a2a]/50">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-neutral-500">Unconfirmed</span>
            <span className="text-neutral-500">{totalUnknown}</span>
          </div>
        </div>
      )}

      {/* Total projectiles */}
      <div className="mt-2 pt-2 border-t border-[#2a2a2a]/50">
        <span
          className="text-[9px] text-neutral-600 uppercase tracking-wider"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {totalProjectiles} projectiles tracked
        </span>
      </div>
    </div>
  );
});
