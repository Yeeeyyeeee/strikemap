"use client";

import { useState, useEffect, useCallback } from "react";
import type { BriefingReport } from "@/lib/types";

const PERIODS = [6, 12, 24] as const;
type Period = (typeof PERIODS)[number];

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  critical: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/25",
    dot: "bg-red-500",
  },
  high: {
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    border: "border-orange-500/25",
    dot: "bg-orange-500",
  },
  medium: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/25",
    dot: "bg-amber-500",
  },
  low: {
    bg: "bg-green-500/10",
    text: "text-green-400",
    border: "border-green-500/25",
    dot: "bg-green-500",
  },
};

function sevColor(s: string) {
  return SEVERITY_COLORS[s] || SEVERITY_COLORS.low;
}

const mono = { fontFamily: "JetBrains Mono, Courier New, monospace" };

function formatClassificationDate(iso: string) {
  const d = new Date(iso);
  return d
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "Z");
}

export default function ReportPanel() {
  const [period, setPeriod] = useState<Period>(24);
  const [report, setReport] = useState<BriefingReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/report?period=${p}`);
      if (!res.ok) throw new Error("Failed to generate briefing");
      const data = await res.json();
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(period);
  }, [period, fetchReport]);

  const now = new Date();
  const dtg = `${String(now.getUTCDate()).padStart(2, "0")}${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}Z ${now.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()} ${now.getUTCFullYear()}`;

  return (
    <div className="h-full overflow-y-auto bg-[#060606]">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 pb-20">
        {/* ═══ CLASSIFICATION BANNER ═══ */}
        <div className="text-center py-1.5 bg-yellow-600/20 border border-yellow-600/30 rounded-sm mb-6">
          <span
            className="text-[10px] font-black tracking-[0.3em] text-yellow-500 uppercase"
            style={mono}
          >
            UNCLASSIFIED // OSINT DERIVED
          </span>
        </div>

        {/* ═══ DOCUMENT HEADER ═══ */}
        <div className="border border-[#2a2a2a] bg-[#0c0c0c] rounded-sm mb-6">
          {/* Top bar */}
          <div className="border-b border-[#2a2a2a] px-5 py-3 flex items-start justify-between gap-4">
            <div>
              <div
                className="text-[10px] text-neutral-600 uppercase tracking-widest mb-1"
                style={mono}
              >
                STRIKEMAP INTELLIGENCE
              </div>
              <h1
                className="text-lg font-black tracking-wider text-neutral-100 uppercase"
                style={mono}
              >
                SITUATION REPORT
              </h1>
              <div className="text-[10px] text-neutral-500 mt-0.5" style={mono}>
                DTG: {dtg}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div
                className="text-[10px] text-neutral-600 uppercase tracking-widest mb-2"
                style={mono}
              >
                PERIOD
              </div>
              <div className="flex gap-0.5">
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    disabled={loading}
                    className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      period === p
                        ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                        : "bg-[#111] text-neutral-600 border border-[#2a2a2a] hover:text-neutral-400"
                    }`}
                    style={mono}
                  >
                    {p}H
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Meta row */}
          {report && !loading && (
            <div
              className="px-5 py-2 flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-neutral-500 border-b border-[#1a1a1a]"
              style={mono}
            >
              <span>GENERATED: {formatClassificationDate(report.generatedAt)}</span>
              <span>INCIDENTS ANALYZED: {report.incidentCount}</span>
              <span>SIGINT POSTS: {report.feedPostCount}</span>
              <span>COVERAGE: {period}H LOOKBACK</span>
            </div>
          )}
        </div>

        {/* ═══ LOADING ═══ */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border border-yellow-500/20 rounded-full" />
              <div className="absolute inset-0 border border-transparent border-t-yellow-500 rounded-full animate-spin" />
              <div
                className="absolute inset-2 border border-transparent border-t-yellow-500/50 rounded-full animate-spin"
                style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
              />
            </div>
            <div className="text-center" style={mono}>
              <p className="text-xs text-yellow-500/70 tracking-wider uppercase">
                Compiling Intelligence
              </p>
              <p className="text-[10px] text-neutral-600 mt-1">{period}-HOUR SITREP IN PROGRESS</p>
            </div>
          </div>
        )}

        {/* ═══ ERROR ═══ */}
        {error && !loading && (
          <div className="border border-red-500/20 bg-red-500/5 rounded-sm p-6 text-center">
            <div
              className="text-[10px] text-red-500 tracking-wider uppercase font-bold mb-2"
              style={mono}
            >
              GENERATION FAILURE
            </div>
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <button
              onClick={() => fetchReport(period)}
              className="text-[10px] text-neutral-400 hover:text-neutral-200 uppercase tracking-wider border border-[#2a2a2a] px-4 py-1.5 hover:border-neutral-500 transition-colors"
              style={mono}
            >
              RETRY GENERATION
            </button>
          </div>
        )}

        {/* ═══ REPORT BODY ═══ */}
        {report && !loading && !error && (
          <div className="space-y-6">
            {/* ── SECTION 1: EXECUTIVE SUMMARY ── */}
            <Section num={1} title="EXECUTIVE SUMMARY">
              <p className="text-[13px] text-neutral-300 leading-[1.8] whitespace-pre-line">
                {report.executive_summary}
              </p>
            </Section>

            {/* ── SECTION 2: KEY DEVELOPMENTS ── */}
            {report.key_developments.length > 0 && (
              <Section num={2} title="KEY DEVELOPMENTS">
                <div className="space-y-2">
                  {report.key_developments.map((dev, i) => {
                    const c = sevColor(dev.severity);
                    return (
                      <div key={i} className={`border-l-2 ${c.border} pl-4 py-2`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 ${c.bg} ${c.text} border ${c.border}`}
                            style={mono}
                          >
                            {dev.severity}
                          </span>
                          <h3 className="text-[13px] font-bold text-neutral-200 uppercase">
                            {dev.headline}
                          </h3>
                        </div>
                        <p className="text-xs text-neutral-400 leading-relaxed ml-3.5">
                          {dev.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── SECTION 3: CHRONOLOGICAL TIMELINE ── */}
            {report.timeline.length > 0 && (
              <Section num={3} title="CHRONOLOGICAL TIMELINE">
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-[59px] top-0 bottom-0 w-px bg-[#1a1a1a]" />
                  <div className="space-y-0">
                    {report.timeline.map((evt, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 py-2 group hover:bg-white/[0.02] transition-colors"
                      >
                        <span
                          className="text-[10px] text-yellow-600 font-bold shrink-0 w-14 text-right pt-0.5"
                          style={mono}
                        >
                          {evt.time}
                        </span>
                        <div className="relative shrink-0 w-2 pt-1.5">
                          <div className="w-2 h-2 rounded-full bg-[#0c0c0c] border border-yellow-600/60 group-hover:border-yellow-500 transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-neutral-300">{evt.event}</span>
                          {evt.location && (
                            <span className="text-[10px] text-neutral-600 ml-2" style={mono}>
                              [{evt.location}]
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {/* ── SECTION 4: OPERATIONAL STATISTICS ── */}
            <Section num={4} title="OPERATIONAL STATISTICS">
              {/* Strike counts */}
              <div className="grid grid-cols-3 gap-px bg-[#1a1a1a] border border-[#1a1a1a] mb-5">
                <StatCard label="TOTAL STRIKES" value={report.statistics.total_strikes} />
                <StatCard
                  label="IRAN STRIKES"
                  value={report.statistics.iran_strikes}
                  color="text-red-400"
                />
                <StatCard
                  label="US/ISR STRIKES"
                  value={report.statistics.us_israel_strikes}
                  color="text-blue-400"
                />
              </div>

              {/* Weapons */}
              {report.statistics.weapons_used.length > 0 && (
                <div className="mb-5">
                  <SubHeading>WEAPONS EMPLOYED</SubHeading>
                  <div className="space-y-1">
                    {report.statistics.weapons_used.map((w, i) => {
                      const maxCount = Math.max(
                        1,
                        ...report.statistics.weapons_used.map((x) => x.count)
                      );
                      const pct = (w.count / maxCount) * 100;
                      return (
                        <div key={i} className="flex items-center gap-3 py-1">
                          <span
                            className="text-[11px] text-neutral-400 w-40 shrink-0 truncate"
                            style={mono}
                          >
                            {w.weapon}
                          </span>
                          <div className="flex-1 h-1 bg-[#111] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-yellow-600/60 rounded-full transition-all"
                              style={{ width: `${Math.max(4, pct)}%` }}
                            />
                          </div>
                          <span
                            className="text-[11px] text-neutral-500 tabular-nums w-6 text-right"
                            style={mono}
                          >
                            {w.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Locations */}
              {report.statistics.locations_affected.length > 0 && (
                <div className="mb-5">
                  <SubHeading>AREAS OF OPERATION</SubHeading>
                  <div className="flex flex-wrap gap-1">
                    {report.statistics.locations_affected.map((loc, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5 bg-[#111] border border-[#1a1a1a] text-neutral-500"
                        style={mono}
                      >
                        {loc}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Damage level */}
              {report.statistics.overall_damage_level && (
                <div className="flex items-center gap-3 pt-3 border-t border-[#1a1a1a]">
                  <span
                    className="text-[10px] text-neutral-600 uppercase tracking-wider"
                    style={mono}
                  >
                    OVERALL DAMAGE ASSESSMENT:
                  </span>
                  {(() => {
                    const c = sevColor(report.statistics.overall_damage_level);
                    return (
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 ${c.bg} ${c.text} border ${c.border}`}
                        style={mono}
                      >
                        {report.statistics.overall_damage_level}
                      </span>
                    );
                  })()}
                </div>
              )}
            </Section>

            {/* ── SECTION 5: THREAT ASSESSMENT ── */}
            <Section num={5} title="THREAT ASSESSMENT / FORECAST">
              <div className="border-l-2 border-red-500/30 pl-4">
                <p className="text-[13px] text-neutral-300 leading-[1.8] whitespace-pre-line">
                  {report.threat_assessment}
                </p>
              </div>
            </Section>

            {/* ═══ FOOTER ═══ */}
            <div className="mt-8 pt-4 border-t border-[#1a1a1a]">
              <div
                className="flex items-center justify-between text-[9px] text-neutral-700 uppercase tracking-widest"
                style={mono}
              >
                <span>{report.sources_summary}</span>
                <span>END OF REPORT</span>
              </div>
            </div>

            {/* Classification footer */}
            <div className="text-center py-1.5 bg-yellow-600/20 border border-yellow-600/30 rounded-sm">
              <span
                className="text-[10px] font-black tracking-[0.3em] text-yellow-500 uppercase"
                style={mono}
              >
                UNCLASSIFIED // OSINT DERIVED
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function Section({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[#1a1a1a] bg-[#0a0a0a]">
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#1a1a1a] bg-[#0c0c0c]">
        <span className="text-[10px] text-yellow-600 font-bold tabular-nums" style={mono}>
          {num}.
        </span>
        <h2
          className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.2em]"
          style={mono}
        >
          {title}
        </h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[9px] text-neutral-600 uppercase tracking-[0.2em] font-bold mb-2 pb-1 border-b border-[#1a1a1a]"
      style={mono}
    >
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "text-neutral-200",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-[#0a0a0a] px-3 py-3 text-center">
      <div className={`text-2xl font-black tabular-nums ${color}`} style={mono}>
        {value}
      </div>
      <div
        className="text-[8px] text-neutral-600 uppercase tracking-[0.15em] mt-1 font-bold"
        style={mono}
      >
        {label}
      </div>
    </div>
  );
}
