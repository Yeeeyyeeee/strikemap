"use client";

import { useState, useMemo } from "react";
import { WEAPONS_CATALOG } from "@/lib/weaponsData";
import WeaponCard from "@/components/WeaponCard";

interface WeaponsDatabaseProps {
  onShowRange?: (lat: number, lng: number, radiusKm: number) => void;
}

type SideFilter = "all" | "iran" | "us_israel";

export default function WeaponsDatabase({ onShowRange }: WeaponsDatabaseProps) {
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");

  const filtered = useMemo(
    () =>
      sideFilter === "all"
        ? WEAPONS_CATALOG
        : WEAPONS_CATALOG.filter((w) => w.side === sideFilter),
    [sideFilter]
  );

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-xl font-bold tracking-wider text-neutral-200"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          WEAPONS DATABASE
        </h2>

        {/* Side filter tabs */}
        <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-0.5">
          <FilterTab
            label="All"
            active={sideFilter === "all"}
            onClick={() => setSideFilter("all")}
            color="#999"
          />
          <FilterTab
            label="Iranian"
            active={sideFilter === "iran"}
            onClick={() => setSideFilter("iran")}
            color="#ef4444"
          />
          <FilterTab
            label="US/Israel"
            active={sideFilter === "us_israel"}
            onClick={() => setSideFilter("us_israel")}
            color="#3b82f6"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((w) => (
          <WeaponCard key={w.name} weapon={w} onShowRange={onShowRange} />
        ))}
      </div>
    </div>
  );
}

function FilterTab({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
        active
          ? "text-white"
          : "text-neutral-500 hover:text-neutral-300"
      }`}
      style={active ? { background: `${color}30`, color } : undefined}
    >
      {label}
    </button>
  );
}
