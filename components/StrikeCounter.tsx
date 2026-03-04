"use client";

import { memo, useMemo } from "react";
import { Incident } from "@/lib/types";

interface StrikeCounterProps {
  incidents: Incident[];
}

export default memo(function StrikeCounter({ incidents }: StrikeCounterProps) {
  const stats = useMemo(() => {
    const strikes = incidents.filter((i) => !i.isStatement);
    const mapped = strikes.filter((i) => i.lat !== 0 || i.lng !== 0);
    const unmapped = strikes.length - mapped.length;
    const iranian = strikes.filter((i) => i.side === "iran").length;
    const usIsrael = strikes.filter(
      (i) => i.side === "us_israel" || i.side === "us" || i.side === "israel"
    ).length;
    return { total: strikes.length, mapped: mapped.length, unmapped, iranian, usIsrael };
  }, [incidents]);

  return (
    <div className="px-3 py-2.5 space-y-1.5">
      <Row label="Total Strikes" value={stats.total} color="#ef4444" />
      <Row label="Mapped" value={stats.mapped} color="#22c55e" />
      <Row label="Unmapped" value={stats.unmapped} color="#eab308" />
      <div className="border-t border-[#2a2a2a]/50 my-1.5" />
      <Row label="Iranian" value={stats.iranian} color="#ef4444" />
      <Row label="US / Israeli" value={stats.usIsrael} color="#3b82f6" />
    </div>
  );
});

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span
          className="text-[10px] text-neutral-400 uppercase tracking-wider"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {label}
        </span>
      </div>
      <span
        className="text-xs font-bold tabular-nums"
        style={{ fontFamily: "JetBrains Mono, monospace", color }}
      >
        {value}
      </span>
    </div>
  );
}
