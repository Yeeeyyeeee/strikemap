"use client";

import { memo, useState, useEffect } from "react";
import { Incident } from "@/lib/types";

interface ConflictClockProps {
  incidents: Incident[];
  lastIranStrikeAt?: number;
  lastUSStrikeAt?: number;
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

export default memo(function ConflictClock({ incidents, lastIranStrikeAt = 0, lastUSStrikeAt = 0 }: ConflictClockProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (incidents.length === 0) return null;

  return (
    <div className="bg-[#1a1a1a]/90 backdrop-blur-sm border border-[#2a2a2a] rounded-lg p-3">
      <h3
        className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Time Since Last Strike
      </h3>
      <div className="flex gap-3">
        {/* Iran */}
        <div className="flex-1 bg-[#111] rounded-md p-2 border border-red-500/20">
          <div className="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-1">IRAN</div>
          <div
            className="text-sm font-bold text-red-300"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {lastIranStrikeAt > 0 ? formatElapsed(now - lastIranStrikeAt) : "—"}
          </div>
        </div>
        {/* US/Israel */}
        <div className="flex-1 bg-[#111] rounded-md p-2 border border-blue-500/20">
          <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wider mb-1">US/IL</div>
          <div
            className="text-sm font-bold text-blue-300"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {lastUSStrikeAt > 0 ? formatElapsed(now - lastUSStrikeAt) : "—"}
          </div>
        </div>
      </div>
    </div>
  );
});
