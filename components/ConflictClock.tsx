"use client";

import { memo, useState, useEffect } from "react";
import { Incident } from "@/lib/types";

interface ConflictClockProps {
  incidents: Incident[];
  lastIranStrikeAt?: number;
  lastUSStrikeAt?: number;
  lastIsraelStrikeAt?: number;
}

function isUSSide(i: Incident): boolean {
  return i.side === "us" || (i.side === "us_israel" && (i.location?.includes("Iran") || false));
}

function isIsraelSide(i: Incident): boolean {
  return i.side === "israel" || (i.side === "us_israel" && !i.location?.includes("Iran"));
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export default memo(function ConflictClock({ incidents, lastIranStrikeAt = 0, lastUSStrikeAt = 0, lastIsraelStrikeAt = 0 }: ConflictClockProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Derive timestamps from incident data
  const effectiveIranAt = lastIranStrikeAt > 0
    ? lastIranStrikeAt
    : (() => {
        const latest = incidents
          .filter((i) => i.side === "iran" && (i.timestamp || i.date))
          .sort((a, b) => ((b.timestamp || b.date) > (a.timestamp || a.date) ? 1 : -1))[0];
        if (!latest) return 0;
        return latest.timestamp
          ? new Date(latest.timestamp).getTime()
          : new Date(latest.date + "T00:00:00").getTime();
      })();

  const effectiveUSAt = lastUSStrikeAt > 0
    ? lastUSStrikeAt
    : (() => {
        const latest = incidents
          .filter((i) => isUSSide(i) && (i.timestamp || i.date))
          .sort((a, b) => ((b.timestamp || b.date) > (a.timestamp || a.date) ? 1 : -1))[0];
        if (!latest) return 0;
        return latest.timestamp
          ? new Date(latest.timestamp).getTime()
          : new Date(latest.date + "T00:00:00").getTime();
      })();

  const effectiveIsraelAt = lastIsraelStrikeAt > 0
    ? lastIsraelStrikeAt
    : (() => {
        const latest = incidents
          .filter((i) => isIsraelSide(i) && (i.timestamp || i.date))
          .sort((a, b) => ((b.timestamp || b.date) > (a.timestamp || a.date) ? 1 : -1))[0];
        if (!latest) return 0;
        return latest.timestamp
          ? new Date(latest.timestamp).getTime()
          : new Date(latest.date + "T00:00:00").getTime();
      })();

  if (incidents.length === 0) return null;

  return (
    <div className="bg-[#1a1a1a]/90 backdrop-blur-sm border border-[#2a2a2a] rounded-lg p-3 w-64">
      <h3
        className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Time Since Last Strike
      </h3>
      <div className="flex gap-2">
        {/* Iran */}
        <div className="flex-1 bg-[#111] rounded-md p-2 border border-red-500/20">
          <div className="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-1">IRAN</div>
          <div
            className="text-xs font-bold text-red-300"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {effectiveIranAt > 0 ? formatElapsed(now - effectiveIranAt) : "—"}
          </div>
        </div>
        {/* US */}
        <div className="flex-1 bg-[#111] rounded-md p-2 border border-blue-500/20">
          <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wider mb-1">US</div>
          <div
            className="text-xs font-bold text-blue-300"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {effectiveUSAt > 0 ? formatElapsed(now - effectiveUSAt) : "—"}
          </div>
        </div>
        {/* Israel */}
        <div className="flex-1 bg-[#111] rounded-md p-2 border border-cyan-500/20">
          <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider mb-1">ISRAEL</div>
          <div
            className="text-xs font-bold text-cyan-300"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {effectiveIsraelAt > 0 ? formatElapsed(now - effectiveIsraelAt) : "—"}
          </div>
        </div>
      </div>
    </div>
  );
});
