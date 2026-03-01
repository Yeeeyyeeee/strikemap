"use client";

import { useMemo } from "react";
import { Incident } from "@/lib/types";
import DonutChart from "@/components/charts/DonutChart";
import BarChart from "@/components/charts/BarChart";
import AreaChart from "@/components/charts/AreaChart";

interface StatsBoardProps {
  incidents: Incident[];
}

export default function StatsBoard({ incidents }: StatsBoardProps) {
  const stats = useMemo(() => {
    const iranStrikes = incidents.filter((i) => i.side === "iran");
    const usStrikes = incidents.filter((i) => i.side === "us_israel");
    const dates = incidents.map((i) => i.date).sort();
    const firstDate = dates[0] || "N/A";
    const lastDate = dates[dates.length - 1] || "N/A";

    // Weapons breakdown
    const weaponCounts = new Map<string, number>();
    for (const inc of incidents) {
      const w = inc.weapon || "Unknown";
      weaponCounts.set(w, (weaponCounts.get(w) || 0) + 1);
    }

    // Target types breakdown
    const targetCounts = new Map<string, number>();
    for (const inc of incidents) {
      const t = inc.target_type || "Unknown";
      targetCounts.set(t, (targetCounts.get(t) || 0) + 1);
    }

    // Military vs civilian per side
    const iranMil = iranStrikes.filter((i) => i.target_military).length;
    const iranCiv = iranStrikes.length - iranMil;
    const usMil = usStrikes.filter((i) => i.target_military).length;
    const usCiv = usStrikes.length - usMil;

    // Timeline (strikes per day)
    const dailyCounts = new Map<string, number>();
    for (const inc of incidents) {
      dailyCounts.set(inc.date, (dailyCounts.get(inc.date) || 0) + 1);
    }
    const sortedDays = Array.from(dailyCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }));

    return {
      total: incidents.length,
      iranCount: iranStrikes.length,
      usCount: usStrikes.length,
      firstDate,
      lastDate,
      weaponCounts,
      targetCounts,
      iranMil,
      iranCiv,
      usMil,
      usCiv,
      sortedDays,
    };
  }, [incidents]);

  const weaponItems = Array.from(stats.weaponCounts.entries()).map(([label, value]) => ({
    label,
    value,
  }));

  const targetItems = Array.from(stats.targetCounts.entries()).map(([label, value]) => ({
    label,
    value,
    color: "#f97316",
  }));

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6 pb-20">
      <h2
        className="text-xl font-bold tracking-wider mb-6 text-neutral-200"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        STRIKE STATISTICS
      </h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <SummaryCard label="Total Strikes" value={stats.total} color="#e5e5e5" />
        <SummaryCard label="Iranian Strikes" value={stats.iranCount} color="#ef4444" />
        <SummaryCard label="US/Israel Strikes" value={stats.usCount} color="#3b82f6" />
        <SummaryCard
          label="Date Range"
          value={`${stats.firstDate.slice(5)} → ${stats.lastDate.slice(5)}`}
          color="#999"
          small
        />
      </div>

      {/* Donut charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-sm text-neutral-500 uppercase tracking-wider mb-4 font-semibold">
            Strikes by Side
          </h3>
          <DonutChart
            segments={[
              { label: "Iran", value: stats.iranCount, color: "#ef4444" },
              { label: "US/Israel", value: stats.usCount, color: "#3b82f6" },
            ]}
            centerText={String(stats.total)}
            centerSub="total"
          />
        </div>
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-sm text-neutral-500 uppercase tracking-wider mb-4 font-semibold">
            Iran: Military vs Civilian
          </h3>
          <DonutChart
            segments={[
              { label: "Military", value: stats.iranMil, color: "#22c55e" },
              { label: "Civilian", value: stats.iranCiv, color: "#f97316" },
            ]}
            centerText={stats.iranCount > 0 ? `${Math.round((stats.iranMil / stats.iranCount) * 100)}%` : "0%"}
            centerSub="military"
          />
        </div>
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-sm text-neutral-500 uppercase tracking-wider mb-4 font-semibold">
            US/Israel: Military vs Civilian
          </h3>
          <DonutChart
            segments={[
              { label: "Military", value: stats.usMil, color: "#22c55e" },
              { label: "Civilian", value: stats.usCiv, color: "#f97316" },
            ]}
            centerText={stats.usCount > 0 ? `${Math.round((stats.usMil / stats.usCount) * 100)}%` : "0%"}
            centerSub="military"
          />
        </div>
      </div>

      {/* Bar charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-sm text-neutral-500 uppercase tracking-wider mb-4 font-semibold">
            Weapons Breakdown
          </h3>
          <BarChart items={weaponItems} defaultColor="#ef4444" />
        </div>
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-sm text-neutral-500 uppercase tracking-wider mb-4 font-semibold">
            Top Target Types
          </h3>
          <BarChart items={targetItems} defaultColor="#f97316" />
        </div>
      </div>

      {/* Timeline area chart */}
      <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
        <h3 className="text-sm text-neutral-500 uppercase tracking-wider mb-4 font-semibold">
          Strikes Per Day
        </h3>
        <AreaChart data={stats.sortedDays} color="#ef4444" height={140} />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  small,
}: {
  label: string;
  value: string | number;
  color: string;
  small?: boolean;
}) {
  return (
    <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
      <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">{label}</p>
      <p
        className={`font-bold ${small ? "text-sm" : "text-2xl"}`}
        style={{ color, fontFamily: "JetBrains Mono, monospace" }}
      >
        {value}
      </p>
    </div>
  );
}
