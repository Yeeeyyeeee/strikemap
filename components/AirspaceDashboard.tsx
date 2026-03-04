"use client";

import { memo, useState, useEffect, useMemo, useCallback } from "react";
import { Incident, NOTAM, RegionAirspace } from "@/lib/types";

interface AirspaceDashboardProps {
  incidents: Incident[];
}

interface NOTAMResponse {
  notams: NOTAM[];
  regions: RegionAirspace[];
  timestamp: string;
  error: boolean;
}

const SEVERITY_COLORS = {
  critical: { bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.3)", text: "#ef4444" },
  warning: { bg: "rgba(234, 179, 8, 0.15)", border: "rgba(234, 179, 8, 0.3)", text: "#eab308" },
  info: { bg: "rgba(56, 189, 248, 0.15)", border: "rgba(56, 189, 248, 0.3)", text: "#38bdf8" },
} as const;

const STATUS_COLORS = {
  open: "#22c55e",
  restricted: "#eab308",
  closed: "#ef4444",
} as const;

const TYPE_LABELS = {
  closure: "CLOSURE",
  restriction: "RESTRICTION",
  military_activity: "MILITARY",
  gps_interference: "GPS/GNSS",
  tfr: "TFR",
} as const;

export default memo(function AirspaceDashboard({ incidents }: AirspaceDashboardProps) {
  const [data, setData] = useState<NOTAMResponse | null>(null);
  const [error, setError] = useState(false);
  const [expandedNotam, setExpandedNotam] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/notams");
      if (!res.ok) throw new Error(`${res.status}`);
      const json: NOTAMResponse = await res.json();
      setData(json);
      setError(json.error);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const closedCount = data?.regions?.filter((r) => r.status === "closed").length ?? 0;

  // Correlate airspace closures with strikes
  const correlations = useMemo(() => {
    if (!data?.notams || incidents.length === 0) return [];

    const criticalNotams = data.notams.filter((n) => n.severity === "critical");
    const results: { notam: NOTAM; incident: Incident; delayMinutes: number }[] = [];

    for (const notam of criticalNotams) {
      const notamTime = new Date(notam.effective_from).getTime();
      if (isNaN(notamTime)) continue;

      // Find strikes within 2 hours after the closure
      for (const inc of incidents) {
        const incTime = inc.timestamp
          ? new Date(inc.timestamp).getTime()
          : new Date(inc.date).getTime();
        if (isNaN(incTime)) continue;

        const delayMs = incTime - notamTime;
        const delayMinutes = Math.round(delayMs / 60000);

        if (delayMinutes >= -30 && delayMinutes <= 120) {
          results.push({ notam, incident: inc, delayMinutes });
        }
      }
    }

    return results.sort((a, b) => a.delayMinutes - b.delayMinutes).slice(0, 10);
  }, [data, incidents]);

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto py-6 px-4 md:px-8 pb-20">
        {/* Title */}
        <div className="text-center mb-8">
          <h1
            className="text-2xl md:text-3xl font-bold tracking-wider mb-2"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            <span className="text-sky-400">AIRSPACE</span>{" "}
            <span className="text-neutral-300">MONITOR</span>
          </h1>
          <p className="text-xs text-neutral-500 max-w-lg mx-auto">
            NOTAMs (Notices to Air Missions) are official alerts about airspace status. Regional
            closures often precede or accompany military operations.
          </p>
          {data?.timestamp && (
            <p
              className="text-[10px] text-neutral-600 mt-2"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Last updated: {new Date(data.timestamp).toLocaleString()}
            </p>
          )}
        </div>

        {/* Regional closure alert */}
        {closedCount >= 3 && (
          <div
            className="mb-6 p-4 rounded-lg border text-center animate-pulse"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              borderColor: "rgba(239, 68, 68, 0.3)",
            }}
          >
            <span
              className="text-sm font-bold text-red-400 uppercase tracking-wider"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Regional Airspace Closure Detected — {closedCount} FIRs Closed
            </span>
          </div>
        )}

        {/* Error state */}
        {error && !data && (
          <div className="text-center py-12">
            <p className="text-neutral-600 text-sm">
              Airspace data unavailable. Upstream API may be down.
            </p>
          </div>
        )}

        {/* Region overview grid */}
        {data?.regions && (
          <>
            <h2
              className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Region Status
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
              {data.regions.map((region) => (
                <div
                  key={region.fir}
                  className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: STATUS_COLORS[region.status],
                        boxShadow:
                          region.status !== "open"
                            ? `0 0 6px ${STATUS_COLORS[region.status]}60`
                            : undefined,
                      }}
                    />
                    <span
                      className="text-sm font-semibold text-neutral-300"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}
                    >
                      {region.country}
                    </span>
                  </div>
                  <p
                    className="text-[10px] text-neutral-600 mb-1"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                  >
                    {region.fir}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p
                      className="text-[10px] font-bold uppercase"
                      style={{
                        color: STATUS_COLORS[region.status],
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {region.status}
                    </p>
                    {region.manual_override && (
                      <span
                        className="text-[8px] font-bold text-sky-400 bg-sky-500/20 px-1 py-0.5 rounded uppercase"
                        style={{ fontFamily: "JetBrains Mono, monospace" }}
                      >
                        MANUAL
                      </span>
                    )}
                  </div>
                  {region.active_notams > 0 && (
                    <p className="text-[10px] text-neutral-600 mt-1">
                      {region.active_notams} active NOTAM{region.active_notams !== 1 ? "s" : ""}
                      {region.critical_notams > 0 && (
                        <span className="text-red-400 ml-1">
                          ({region.critical_notams} critical)
                        </span>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Active NOTAMs list */}
        {data?.notams && data.notams.length > 0 && (
          <>
            <h2
              className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Active NOTAMs ({data.notams.length})
            </h2>
            <div className="space-y-2 mb-8">
              {data.notams
                .sort((a, b) => {
                  const severityOrder = { critical: 0, warning: 1, info: 2 };
                  return severityOrder[a.severity] - severityOrder[b.severity];
                })
                .map((notam) => {
                  const colors = SEVERITY_COLORS[notam.severity];
                  const isExpanded = expandedNotam === notam.id;
                  return (
                    <div
                      key={notam.id}
                      className="bg-[#1a1a1a] border rounded-lg overflow-hidden cursor-pointer"
                      style={{
                        borderColor:
                          notam.severity === "critical" ? "rgba(239, 68, 68, 0.3)" : "#2a2a2a",
                        borderLeftWidth: notam.severity === "critical" ? "3px" : "1px",
                        borderLeftColor: notam.severity === "critical" ? "#ef4444" : "#2a2a2a",
                      }}
                      onClick={() => setExpandedNotam(isExpanded ? null : notam.id)}
                    >
                      <div className="p-3 flex items-start gap-3">
                        {/* Severity badge */}
                        <span
                          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                          style={{
                            color: colors.text,
                            backgroundColor: colors.bg,
                            border: `1px solid ${colors.border}`,
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          {notam.severity}
                        </span>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="text-[10px] text-neutral-500"
                              style={{ fontFamily: "JetBrains Mono, monospace" }}
                            >
                              {notam.fir}
                            </span>
                            <span className="text-neutral-600 text-[10px]">|</span>
                            <span className="text-[10px] text-neutral-500">{notam.country}</span>
                            <span className="text-neutral-600 text-[10px]">|</span>
                            <span
                              className="text-[10px]"
                              style={{
                                color: colors.text,
                                fontFamily: "JetBrains Mono, monospace",
                              }}
                            >
                              {TYPE_LABELS[notam.type]}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-300">{notam.summary}</p>
                          <p className="text-[10px] text-neutral-600 mt-1">
                            {new Date(notam.effective_from).toLocaleString()} —{" "}
                            {notam.effective_to === "PERM"
                              ? "PERMANENT"
                              : new Date(notam.effective_to).toLocaleString()}
                          </p>
                        </div>

                        {/* Expand indicator */}
                        <span className="text-neutral-600 text-xs flex-shrink-0">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>

                      {/* Expanded raw text */}
                      {isExpanded && (
                        <div className="px-3 pb-3 border-t border-[#2a2a2a]">
                          <pre
                            className="text-[10px] text-neutral-500 mt-2 whitespace-pre-wrap break-all leading-relaxed"
                            style={{ fontFamily: "JetBrains Mono, monospace" }}
                          >
                            {notam.raw_text}
                          </pre>
                          {notam.altitude_floor !== undefined && (
                            <p className="text-[10px] text-neutral-600 mt-2">
                              Altitude: FL{notam.altitude_floor} — FL
                              {notam.altitude_ceiling ?? "UNL"}
                            </p>
                          )}
                          {notam.lat && notam.lng && (
                            <p className="text-[10px] text-neutral-600">
                              Position: {notam.lat.toFixed(2)}N, {notam.lng.toFixed(2)}E
                              {notam.radius_nm && ` (${notam.radius_nm} NM radius)`}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}

        {/* No active NOTAMs */}
        {data?.notams && data.notams.length === 0 && (
          <div className="text-center py-8 mb-8">
            <p
              className="text-sm text-green-500 font-semibold"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              No relevant NOTAMs active — all monitored airspace is OPEN
            </p>
          </div>
        )}

        {/* Timeline correlation */}
        {correlations.length > 0 && (
          <>
            <h2
              className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Closure → Strike Correlation
            </h2>
            <div className="space-y-2">
              {correlations.map((corr, i) => (
                <div
                  key={i}
                  className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 flex items-center gap-3"
                >
                  <div className="flex-shrink-0">
                    <span
                      className="text-[10px] font-bold text-red-400 uppercase"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}
                    >
                      {corr.notam.fir}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-neutral-300">
                      Airspace closed{" "}
                      {new Date(corr.notam.effective_from).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      })}{" "}
                      UTC
                      {" → "}
                      Strike at {corr.incident.location}{" "}
                      {corr.incident.timestamp
                        ? new Date(corr.incident.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "UTC",
                          })
                        : corr.incident.date}{" "}
                      UTC
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded"
                      style={{
                        color: corr.delayMinutes <= 30 ? "#ef4444" : "#eab308",
                        backgroundColor:
                          corr.delayMinutes <= 30
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(234, 179, 8, 0.15)",
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {corr.delayMinutes >= 0 ? `+${corr.delayMinutes}m` : `${corr.delayMinutes}m`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
