"use client";

import { memo, useMemo, useState, useEffect } from "react";
import { Incident, NOTAM } from "@/lib/types";
import { computeEscalation } from "@/lib/escalationScore";

interface MobileStatsPanelProps {
  incidents: Incident[];
  notams?: NOTAM[];
  lastIranStrikeAt?: number;
  lastUSStrikeAt?: number;
  lastIsraelStrikeAt?: number;
  onClose?: () => void;
}

interface SideCasualties {
  killed: number;
  injured: number;
  military: number;
  civilian: number;
}

interface ISWCorroboration {
  usIsraelStrikes: number;
  iranRetaliationStrikes: number;
  fetchedAt: string;
}

interface CasualtyData {
  iran: SideCasualties;
  usIsrael: SideCasualties;
  isw?: ISWCorroboration;
}

export default memo(function MobileStatsPanel({
  incidents,
  notams,
  lastIranStrikeAt,
  lastUSStrikeAt,
  lastIsraelStrikeAt,
  onClose,
}: MobileStatsPanelProps) {
  const escalation = useMemo(() => computeEscalation(incidents, notams), [incidents, notams]);

  const accuracy = useMemo(() => {
    const calc = (side: string) => {
      const filtered = incidents.filter((i) => {
        if (side === "iran" && i.side !== "iran") return false;
        if (side === "us_israel" && i.side !== "us_israel" && i.side !== "us" && i.side !== "israel") return false;
        if (!i.lat || !i.lng) return false;
        const tt = (i.target_type || "").toLowerCase();
        return tt && tt !== "unknown" && tt !== "undetermined" && tt !== "pending";
      });
      const mil = filtered.filter((i) => i.target_military).length;
      const total = filtered.length;
      return { mil, civ: total - mil, total, pct: total > 0 ? Math.round((mil / total) * 100) : 0 };
    };
    return { iran: calc("iran"), us: calc("us_israel") };
  }, [incidents]);

  const intercept = useMemo(() => {
    let totalIntercepted = 0;
    let totalMissed = 0;
    for (const i of incidents) {
      if (i.intercept_success === true) totalIntercepted++;
      else if (i.intercept_success === false) totalMissed++;
    }
    const confirmed = totalIntercepted + totalMissed;
    return { intercepted: totalIntercepted, missed: totalMissed, rate: confirmed > 0 ? Math.round((totalIntercepted / confirmed) * 100) : 0 };
  }, [incidents]);

  // Fetch Wikipedia-sourced casualties
  const [casualties, setCasualties] = useState<CasualtyData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/casualties")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d && !d.error) setCasualties(d);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const casualtyTotal = casualties
    ? casualties.iran.killed + casualties.usIsrael.killed
    : 0;

  const lastStrikes = useMemo(() => {
    const findLast = (side: string, override?: number) => {
      if (override) return override;
      let latest = 0;
      for (const i of incidents) {
        const match = side === "iran" ? i.side === "iran"
          : i.side === "us_israel" || i.side === "us" || i.side === "israel";
        if (!match) continue;
        const ts = i.timestamp ? new Date(i.timestamp).getTime() : new Date(i.date).getTime();
        if (ts > latest) latest = ts;
      }
      return latest;
    };
    return {
      iran: findLast("iran", lastIranStrikeAt),
      us: findLast("us", lastUSStrikeAt),
      israel: findLast("israel", lastIsraelStrikeAt),
    };
  }, [incidents, lastIranStrikeAt, lastUSStrikeAt, lastIsraelStrikeAt]);

  const formatElapsed = (ts: number) => {
    if (!ts) return "\u2014";
    const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diff > 86400) {
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      return `${d}d ${h}h`;
    }
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const escColor = escalation.color;

  return (
    <div className="fixed inset-0 top-14 bottom-14 z-40 md:hidden bg-[#0a0a0a] overflow-y-auto">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h2
            className="text-[10px] font-bold uppercase tracking-wider text-neutral-500"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Live Statistics
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-red-400/70 hover:text-red-400 p-1.5 -mr-1.5 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Escalation */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              Escalation Level
            </span>
            <span
              className="text-xs font-bold uppercase px-2 py-0.5 rounded"
              style={{ color: escColor, background: `${escColor}20`, border: `1px solid ${escColor}30` }}
            >
              {escalation.level}
            </span>
          </div>
          <div className="w-full h-3 bg-[#2a2a2a] rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${escalation.score}%`, backgroundColor: escColor }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold" style={{ color: escColor, fontFamily: "JetBrains Mono, monospace" }}>
              {escalation.score}
            </span>
            <span className="text-[10px] text-neutral-600">/100</span>
          </div>
          {escalation.factors.length > 0 && (
            <div className="mt-2 space-y-1">
              {escalation.factors.slice(0, 3).map((f, i) => (
                <p key={i} className="text-[10px] text-neutral-500">{f}</p>
              ))}
            </div>
          )}
        </div>

        {/* Last Strikes */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-3" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            Time Since Last Strike
          </span>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#111] rounded-lg p-3 text-center">
              <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 block mb-1">Iran</span>
              <span className="text-sm font-bold text-neutral-200" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {formatElapsed(lastStrikes.iran)}
              </span>
            </div>
            <div className="bg-[#111] rounded-lg p-3 text-center">
              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400 block mb-1">US</span>
              <span className="text-sm font-bold text-neutral-200" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {formatElapsed(lastStrikes.us)}
              </span>
            </div>
            <div className="bg-[#111] rounded-lg p-3 text-center">
              <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-400 block mb-1">Israel</span>
              <span className="text-sm font-bold text-neutral-200" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {formatElapsed(lastStrikes.israel)}
              </span>
            </div>
          </div>
        </div>

        {/* Accuracy + Intercept row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Iran Accuracy */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 block mb-2" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              Iran Accuracy
            </span>
            <span className="text-2xl font-bold text-neutral-200 block" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {accuracy.iran.pct}%
            </span>
            <div className="w-full h-2 bg-[#2a2a2a] rounded-full overflow-hidden mt-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${accuracy.iran.pct}%`,
                  backgroundColor: accuracy.iran.pct >= 70 ? "#22c55e" : accuracy.iran.pct >= 40 ? "#eab308" : "#ef4444",
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-600">
              <span>{accuracy.iran.mil} mil</span>
              <span>{accuracy.iran.civ} civ</span>
            </div>
          </div>

          {/* US/Israel Accuracy */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 block mb-2" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              US/IL Accuracy
            </span>
            <span className="text-2xl font-bold text-neutral-200 block" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {accuracy.us.pct}%
            </span>
            <div className="w-full h-2 bg-[#2a2a2a] rounded-full overflow-hidden mt-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${accuracy.us.pct}%`,
                  backgroundColor: accuracy.us.pct >= 70 ? "#22c55e" : accuracy.us.pct >= 40 ? "#eab308" : "#ef4444",
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-600">
              <span>{accuracy.us.mil} mil</span>
              <span>{accuracy.us.civ} civ</span>
            </div>
          </div>
        </div>

        {/* Intercept Rate */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              Intercept Rate
            </span>
            <span className="text-xs font-bold" style={{
              color: intercept.rate >= 80 ? "#22c55e" : intercept.rate >= 50 ? "#eab308" : "#ef4444",
              fontFamily: "JetBrains Mono, monospace",
            }}>
              {intercept.rate}%
            </span>
          </div>
          <div className="w-full h-3 bg-[#2a2a2a] rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${intercept.rate}%`,
                backgroundColor: intercept.rate >= 80 ? "#22c55e" : intercept.rate >= 50 ? "#eab308" : "#ef4444",
              }}
            />
          </div>
          <div className="flex gap-4 text-[10px] text-neutral-500">
            <span><span className="text-green-400 font-bold">{intercept.intercepted}</span> intercepted</span>
            <span><span className="text-red-400 font-bold">{intercept.missed}</span> missed</span>
          </div>
        </div>

        {/* Casualties — Wikipedia sourced */}
        {casualties && casualtyTotal > 0 && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                Casualties
              </span>
              <span className="text-xs font-bold text-neutral-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {casualtyTotal.toLocaleString()} total
              </span>
            </div>
            <div className="space-y-2">
              {casualties.iran.killed > 0 && (
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      Iranian
                    </span>
                    <span className="text-sm font-bold text-red-400 font-mono">{casualties.iran.killed.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-3 text-[10px] text-neutral-500">
                    {casualties.iran.military > 0 && <span><span className="text-red-400/80 font-mono">{casualties.iran.military.toLocaleString()}</span> military</span>}
                    {casualties.iran.civilian > 0 && <span><span className="text-orange-400/80 font-mono">{casualties.iran.civilian.toLocaleString()}</span> civilian</span>}
                    {casualties.iran.injured > 0 && <span><span className="text-yellow-400/80 font-mono">{casualties.iran.injured.toLocaleString()}</span> injured</span>}
                  </div>
                </div>
              )}
              {casualties.usIsrael.killed > 0 && (
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      US / Israeli
                    </span>
                    <span className="text-sm font-bold text-blue-400 font-mono">{casualties.usIsrael.killed.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-3 text-[10px] text-neutral-500">
                    {casualties.usIsrael.military > 0 && <span><span className="text-red-400/80 font-mono">{casualties.usIsrael.military.toLocaleString()}</span> military</span>}
                    {casualties.usIsrael.civilian > 0 && <span><span className="text-orange-400/80 font-mono">{casualties.usIsrael.civilian.toLocaleString()}</span> civilian</span>}
                    {casualties.usIsrael.injured > 0 && <span><span className="text-yellow-400/80 font-mono">{casualties.usIsrael.injured.toLocaleString()}</span> injured</span>}
                  </div>
                </div>
              )}
            </div>
            {/* ISW corroboration */}
            {casualties.isw && (casualties.isw.usIsraelStrikes > 0 || casualties.isw.iranRetaliationStrikes > 0) && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-neutral-600 mt-2 pt-2 border-t border-[#2a2a2a]">
                <span className="text-neutral-500">ISW/CTP confirms:</span>
                {casualties.isw.usIsraelStrikes > 0 && (
                  <span><span className="text-blue-400/70 font-mono">{casualties.isw.usIsraelStrikes.toLocaleString()}</span> US/IL strikes</span>
                )}
                {casualties.isw.iranRetaliationStrikes > 0 && (
                  <span><span className="text-red-400/70 font-mono">{casualties.isw.iranRetaliationStrikes.toLocaleString()}</span> Iran strikes</span>
                )}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 mt-2">
              <a
                href="https://en.wikipedia.org/wiki/2026_Iran_war"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                Wikipedia
              </a>
              {casualties.isw && (
                <>
                  <span className="text-[9px] text-neutral-700">|</span>
                  <a
                    href="https://storymaps.arcgis.com/stories/089bc1a2fe684405a67d67f13bd31324"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-neutral-600 hover:text-neutral-400 transition-colors"
                  >
                    ISW/CTP
                  </a>
                </>
              )}
            </div>
          </div>
        )}

        {/* Total Strikes Summary */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-3" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            Strike Count
          </span>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#111] rounded-lg p-3 text-center">
              <span className="text-[9px] font-bold uppercase text-neutral-500 block mb-1">Total</span>
              <span className="text-lg font-bold text-neutral-200" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {incidents.filter((i) => !i.isStatement).length}
              </span>
            </div>
            <div className="bg-[#111] rounded-lg p-3 text-center">
              <span className="text-[9px] font-bold uppercase text-red-400 block mb-1">Iran</span>
              <span className="text-lg font-bold text-red-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {incidents.filter((i) => i.side === "iran" && !i.isStatement).length}
              </span>
            </div>
            <div className="bg-[#111] rounded-lg p-3 text-center">
              <span className="text-[9px] font-bold uppercase text-blue-400 block mb-1">US/IL</span>
              <span className="text-lg font-bold text-blue-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {incidents.filter((i) => (i.side === "us_israel" || i.side === "us" || i.side === "israel") && !i.isStatement).length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
