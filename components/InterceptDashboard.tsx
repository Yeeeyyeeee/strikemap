"use client";

import { memo, useMemo } from "react";
import { Incident } from "@/lib/types";
import { SYSTEM_COLORS } from "./InterceptGauge";

interface InterceptDashboardProps {
  incidents: Incident[];
}

interface SystemDetail {
  name: string;
  color: string;
  country: string;
  role: string;
  intercepted: number;
  missed: number;
  unknown: number;
  projectilesFired: number;
  projectilesIntercepted: number;
  rate: number;
}

const SYSTEM_META: Record<string, { country: string; role: string }> = {
  "Iron Dome": { country: "Israel", role: "Short-range rockets & mortars" },
  "Arrow-3": { country: "Israel/US", role: "Exo-atmospheric ballistic missiles" },
  "Arrow-2": { country: "Israel", role: "Ballistic missiles (endo-atmospheric)" },
  THAAD: { country: "US", role: "Ballistic missiles (terminal phase)" },
  "David's Sling": { country: "Israel", role: "Medium-range missiles & rockets" },
  "S-300": { country: "Iran", role: "Cruise missiles & aircraft" },
  "Bavar-373": { country: "Iran", role: "Ballistic missiles & aircraft" },
  "Khordad-15": { country: "Iran", role: "Cruise missiles & drones" },
};

function getColor(pct: number): string {
  if (pct >= 80) return "#22c55e";
  if (pct >= 50) return "#eab308";
  return "#ef4444";
}

export default memo(function InterceptDashboard({ incidents }: InterceptDashboardProps) {
  const withIntercept = useMemo(
    () => incidents.filter((i) => i.intercepted_by && i.intercepted_by.length > 0),
    [incidents]
  );

  // ---- Top-level stats ----
  const stats = useMemo(() => {
    let totalFired = 0;
    let totalIntercepted = 0;
    let totalLeaked = 0;

    for (const inc of withIntercept) {
      const fired = inc.missiles_fired || 1;
      const intercepted = inc.missiles_intercepted || (inc.intercept_success === true ? 1 : 0);
      totalFired += fired;
      totalIntercepted += intercepted;
      if (inc.intercept_success === false) {
        totalLeaked += inc.missiles_fired ? (inc.missiles_fired - (inc.missiles_intercepted || 0)) : 1;
      }
    }

    const rate = totalFired > 0 ? Math.round((totalIntercepted / totalFired) * 100) : 0;
    return { totalFired, totalIntercepted, totalLeaked, rate };
  }, [withIntercept]);

  // ---- Per-system breakdown ----
  const systems = useMemo(() => {
    const map = new Map<string, { intercepted: number; missed: number; unknown: number; pFired: number; pIntercepted: number }>();
    for (const inc of withIntercept) {
      const sys = inc.intercepted_by!;
      const e = map.get(sys) || { intercepted: 0, missed: 0, unknown: 0, pFired: 0, pIntercepted: 0 };
      if (inc.intercept_success === true) e.intercepted++;
      else if (inc.intercept_success === false) e.missed++;
      else e.unknown++;
      if (inc.missiles_fired) e.pFired += inc.missiles_fired;
      if (inc.missiles_intercepted) e.pIntercepted += inc.missiles_intercepted;
      map.set(sys, e);
    }

    return Array.from(map.entries())
      .map(([name, e]): SystemDetail => {
        const confirmed = e.intercepted + e.missed;
        const meta = SYSTEM_META[name] || { country: "Unknown", role: "Defense system" };
        return {
          name,
          color: SYSTEM_COLORS[name] || "#999",
          country: meta.country,
          role: meta.role,
          intercepted: e.intercepted,
          missed: e.missed,
          unknown: e.unknown,
          projectilesFired: e.pFired,
          projectilesIntercepted: e.pIntercepted,
          rate: confirmed > 0 ? Math.round((e.intercepted / confirmed) * 100) : 0,
        };
      })
      .sort((a, b) => (b.intercepted + b.missed + b.unknown) - (a.intercepted + a.missed + a.unknown));
  }, [withIntercept]);

  // ---- Per-side comparison ----
  const sideStats = useMemo(() => {
    const iranDef = { intercepted: 0, missed: 0, unknown: 0, total: 0 };
    const westDef = { intercepted: 0, missed: 0, unknown: 0, total: 0 };

    for (const inc of withIntercept) {
      const sys = inc.intercepted_by!;
      const isIranSystem = ["S-300", "Bavar-373", "Khordad-15"].includes(sys);
      const bucket = isIranSystem ? iranDef : westDef;
      bucket.total++;
      if (inc.intercept_success === true) bucket.intercepted++;
      else if (inc.intercept_success === false) bucket.missed++;
      else bucket.unknown++;
    }

    return {
      iran: { ...iranDef, rate: (iranDef.intercepted + iranDef.missed) > 0 ? Math.round((iranDef.intercepted / (iranDef.intercepted + iranDef.missed)) * 100) : 0 },
      west: { ...westDef, rate: (westDef.intercepted + westDef.missed) > 0 ? Math.round((westDef.intercepted / (westDef.intercepted + westDef.missed)) * 100) : 0 },
    };
  }, [withIntercept]);

  // ---- Engagement log ----
  const engagements = useMemo(
    () =>
      [...withIntercept]
        .sort((a, b) => {
          const ta = a.timestamp || a.date;
          const tb = b.timestamp || b.date;
          return tb.localeCompare(ta);
        }),
    [withIntercept]
  );

  if (withIntercept.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-[#0d0d0d]">
        <div className="max-w-5xl mx-auto px-4 py-12 flex flex-col items-center justify-center gap-4">
          <svg className="w-16 h-16 text-neutral-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h2
            className="text-lg text-neutral-500 font-semibold uppercase tracking-wider"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            No Interception Data
          </h2>
          <p className="text-sm text-neutral-600 text-center max-w-md">
            Interception events will appear here as defense system engagements are detected from OSINT feeds.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0d0d0d]">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Title */}
        <h2
          className="text-sm font-semibold text-neutral-500 uppercase tracking-wider"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Interception Dashboard
        </h2>

        {/* Top stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Projectiles Tracked" value={stats.totalFired} color="#e5e5e5" />
          <StatCard label="Intercepted" value={stats.totalIntercepted} color="#22c55e" />
          <StatCard label="Leaked Through" value={stats.totalLeaked} color="#ef4444" />
          <StatCard label="Interception Rate" value={`${stats.rate}%`} color={getColor(stats.rate)} />
        </div>

        {/* Per-system breakdown */}
        <section>
          <h3
            className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Defense Systems
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {systems.map((sys) => (
              <div
                key={sys.name}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-semibold" style={{ color: sys.color }}>
                      {sys.name}
                    </span>
                    <span className="text-[10px] text-neutral-600 ml-2">{sys.country}</span>
                  </div>
                  <span
                    className="text-lg font-bold"
                    style={{ color: getColor(sys.rate), fontFamily: "JetBrains Mono, monospace" }}
                  >
                    {sys.rate}%
                  </span>
                </div>
                <p className="text-[10px] text-neutral-500 mb-3">{sys.role}</p>

                {/* Counts */}
                <div className="flex items-center gap-4 text-[11px] mb-2">
                  <span className="text-green-400">
                    &#x2713; {sys.intercepted}
                  </span>
                  <span className="text-red-400">
                    &#x2717; {sys.missed}
                  </span>
                  <span className="text-neutral-500">
                    ? {sys.unknown}
                  </span>
                </div>

                {/* Bar gauge */}
                <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${sys.rate}%`,
                      backgroundColor: sys.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Per-side comparison */}
        {(sideStats.iran.total > 0 || sideStats.west.total > 0) && (
          <section>
            <h3
              className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Defense Performance Comparison
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SideCard
                label="Israel / US Defense"
                stats={sideStats.west}
                color="#3b82f6"
              />
              <SideCard
                label="Iran Defense"
                stats={sideStats.iran}
                color="#ef4444"
              />
            </div>
          </section>
        )}

        {/* Engagement log */}
        <section>
          <h3
            className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Engagement Log
          </h3>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
            <div className="hidden md:grid grid-cols-[140px_120px_120px_1fr_1fr] gap-2 px-4 py-2 border-b border-[#2a2a2a] text-[9px] text-neutral-600 uppercase tracking-wider" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              <span>Time</span>
              <span>System</span>
              <span>Outcome</span>
              <span>Location</span>
              <span>Weapon</span>
            </div>
            <div className="divide-y divide-[#2a2a2a]/50 max-h-96 overflow-y-auto">
              {engagements.map((inc) => (
                <div
                  key={inc.id}
                  className="grid grid-cols-1 md:grid-cols-[140px_120px_120px_1fr_1fr] gap-1 md:gap-2 px-4 py-2.5 hover:bg-[#222] transition-colors"
                >
                  <span className="text-[11px] text-neutral-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {inc.timestamp
                      ? new Date(inc.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : inc.date}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: SYSTEM_COLORS[inc.intercepted_by!] || "#999" }}>
                    {inc.intercepted_by}
                  </span>
                  <span className="text-[11px] font-semibold">
                    {inc.intercept_success === true ? (
                      <span className="text-green-400">INTERCEPTED</span>
                    ) : inc.intercept_success === false ? (
                      <span className="text-red-400">MISSED</span>
                    ) : (
                      <span className="text-neutral-500">UNCONFIRMED</span>
                    )}
                  </span>
                  <span className="text-[11px] text-neutral-300 truncate">{inc.location}</span>
                  <span className="text-[11px] text-neutral-400 truncate">{inc.weapon || "Unknown"}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <p className="text-[10px] text-neutral-600 text-center pb-4">
          Interception data based on initial reports and may be revised as verified information becomes available.
        </p>
      </div>
    </div>
  );
});

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
      <div
        className="text-2xl font-bold mb-1"
        style={{ color, fontFamily: "JetBrains Mono, monospace" }}
      >
        {value}
      </div>
      <div
        className="text-[10px] text-neutral-500 uppercase tracking-wider"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        {label}
      </div>
    </div>
  );
}

function SideCard({ label, stats, color }: {
  label: string;
  stats: { intercepted: number; missed: number; unknown: number; total: number; rate: number };
  color: string;
}) {
  if (stats.total === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
        <div className="text-sm font-semibold mb-2" style={{ color }}>{label}</div>
        <p className="text-[11px] text-neutral-600">No engagements recorded</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color }}>{label}</span>
        <span
          className="text-lg font-bold"
          style={{ color: getColor(stats.rate), fontFamily: "JetBrains Mono, monospace" }}
        >
          {stats.rate}%
        </span>
      </div>
      <div className="flex items-center gap-4 text-[11px] mb-2">
        <span className="text-green-400">&#x2713; {stats.intercepted}</span>
        <span className="text-red-400">&#x2717; {stats.missed}</span>
        <span className="text-neutral-500">? {stats.unknown}</span>
      </div>
      <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${stats.rate}%`, backgroundColor: color }}
        />
      </div>
      <div className="text-[10px] text-neutral-600 mt-2">
        {stats.total} engagements
      </div>
    </div>
  );
}
