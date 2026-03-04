"use client";

import { memo, useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { NOTAM, RegionAirspace } from "@/lib/types";

interface NOTAMResponse {
  notams: NOTAM[];
  regions: RegionAirspace[];
  timestamp: string;
  error: boolean;
}

// Country display order and short codes
const COUNTRY_ORDER = [
  { country: "Iran", code: "IR" },
  { country: "Israel", code: "IL" },
  { country: "Lebanon", code: "LB" },
  { country: "Syria", code: "SY" },
  { country: "Iraq", code: "IQ" },
  { country: "Jordan", code: "JO" },
  { country: "Saudi Arabia", code: "SA" },
  { country: "Yemen", code: "YE" },
  { country: "UAE", code: "AE" },
  { country: "Bahrain", code: "BH" },
  { country: "Oman", code: "OM" },
];

const STATUS_COLORS = {
  open: "#22c55e",
  restricted: "#eab308",
  closed: "#ef4444",
} as const;

export default memo(function AirspaceStatus() {
  const [data, setData] = useState<NOTAMResponse | null>(null);
  const [error, setError] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

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
    const interval = setInterval(fetchData, 5 * 60 * 1000); // 5 min
    return () => clearInterval(interval);
  }, [fetchData]);

  // Aggregate FIRs per country (Iran has 2 FIRs)
  const countryStatuses = useMemo(() => {
    if (!data?.regions) return [];
    return COUNTRY_ORDER.map(({ country, code }) => {
      const firs = data.regions.filter((r) => r.country === country);
      if (firs.length === 0) {
        return { country, code, status: "open" as const, activeNotams: 0, criticalNotams: 0 };
      }
      const hasClosed = firs.some((f) => f.status === "closed");
      const hasRestricted = firs.some((f) => f.status === "restricted");
      const totalActive = firs.reduce((sum, f) => sum + f.active_notams, 0);
      const totalCritical = firs.reduce((sum, f) => sum + f.critical_notams, 0);
      const hasManualOverride = firs.some((f) => f.manual_override);
      return {
        country,
        code,
        status: hasClosed ? ("closed" as const) : hasRestricted ? ("restricted" as const) : ("open" as const),
        activeNotams: totalActive,
        criticalNotams: totalCritical,
        manualOverride: hasManualOverride,
      };
    });
  }, [data]);

  const closedCount = countryStatuses.filter((c) => c.status === "closed").length;
  const allOpen = countryStatuses.every((c) => c.status === "open");

  // Check Iran + Israel both closed
  const iranClosed = countryStatuses.find((c) => c.code === "IR")?.status === "closed";
  const israelClosed = countryStatuses.find((c) => c.code === "IL")?.status === "closed";

  return (
    <div className="w-full p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3
          className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Airspace Status
        </h3>
        <div className="relative">
          <button
            className="text-neutral-600 hover:text-neutral-400 text-[10px] transition-colors"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            (i)
          </button>
          {showTooltip && (
            <div className="absolute right-0 top-5 z-50 w-48 bg-[#111111] border border-[#2a2a2a] rounded-md p-2 shadow-lg">
              <p className="text-[10px] text-neutral-400 leading-relaxed">
                NOTAMs (Notices to Air Missions) are official alerts about airspace status. Regional closures often precede or accompany military operations.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Regional closure alert banner */}
      {closedCount >= 3 && (
        <div
          className="mb-2 px-2 py-1.5 rounded border text-center animate-pulse"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            borderColor: "rgba(239, 68, 68, 0.3)",
          }}
        >
          <span
            className="text-[9px] font-bold text-red-400 uppercase tracking-wider"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Regional Airspace Closure Detected
          </span>
        </div>
      )}

      {/* Iran + Israel simultaneous closure */}
      {iranClosed && israelClosed && closedCount < 3 && (
        <div
          className="mb-2 px-2 py-1 rounded border"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            borderColor: "rgba(239, 68, 68, 0.2)",
          }}
        >
          <span
            className="text-[9px] font-semibold text-red-400 uppercase tracking-wider"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            IR + IL Airspace Closed
          </span>
        </div>
      )}

      {/* Error state */}
      {error && !data && (
        <p
          className="text-[10px] text-neutral-600 text-center py-2"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Airspace data unavailable
        </p>
      )}

      {/* All open state */}
      {!error && data && allOpen && (
        <p
          className="text-[10px] text-green-500 text-center py-1"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          All monitored airspace: OPEN
        </p>
      )}

      {/* Country rows */}
      {data && !allOpen && (
        <div className="space-y-1">
          {countryStatuses.map(({ country, code, status, manualOverride }) => (
            <div key={code} className="flex items-center gap-2">
              {/* Status dot */}
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: STATUS_COLORS[status],
                  boxShadow: status !== "open" ? `0 0 4px ${STATUS_COLORS[status]}60` : undefined,
                }}
              />
              {/* Country name */}
              <span
                className="text-[10px] text-neutral-400 flex-1 truncate"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {country}
              </span>
              {/* Manual override badge */}
              {manualOverride && (
                <span
                  className="text-[7px] font-bold text-sky-400 bg-sky-500/20 px-1 rounded flex-shrink-0"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  M
                </span>
              )}
              {/* Status label */}
              <span
                className="text-[9px] font-bold flex-shrink-0"
                style={{
                  color: STATUS_COLORS[status],
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Always show country rows (even if all open, show compact version) */}
      {data && allOpen && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          {countryStatuses.map(({ country, code, status }) => (
            <div key={code} className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[status] }}
              />
              <span
                className="text-[9px] text-neutral-500"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {country}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* View details link */}
      <Link
        href="/airspace"
        className="block w-full mt-2 text-[10px] text-neutral-600 hover:text-sky-400 transition-colors text-center"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        View Details →
      </Link>
    </div>
  );
});
