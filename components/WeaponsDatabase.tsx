"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { WEAPONS_CATALOG, WeaponSpec } from "@/lib/weaponsData";
import WeaponCard from "@/components/WeaponCard";

interface WeaponsDatabaseProps {
  onShowRange?: (lat: number, lng: number, radiusKm: number) => void;
}

type SideFilter = "all" | "iran" | "us_israel";
type SortOption = "name" | "range_desc" | "range_asc" | "warhead_desc" | "type";

const SORT_LABELS: Record<SortOption, string> = {
  name: "Name (A-Z)",
  range_desc: "Range (longest)",
  range_asc: "Range (shortest)",
  warhead_desc: "Warhead (heaviest)",
  type: "Type",
};

function sortWeapons(weapons: WeaponSpec[], sort: SortOption): WeaponSpec[] {
  const sorted = [...weapons];
  switch (sort) {
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "range_desc":
      return sorted.sort((a, b) => b.range_km - a.range_km);
    case "range_asc":
      return sorted.sort((a, b) => a.range_km - b.range_km);
    case "warhead_desc":
      return sorted.sort((a, b) => b.warhead_kg - a.warhead_kg);
    case "type":
      return sorted.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    default:
      return sorted;
  }
}

export default function WeaponsDatabase({ onShowRange }: WeaponsDatabaseProps) {
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [sortOpen, setSortOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sortOpen]);

  const filtered = useMemo(() => {
    const byFilter =
      sideFilter === "all"
        ? WEAPONS_CATALOG
        : WEAPONS_CATALOG.filter((w) => w.side === sideFilter);
    return sortWeapons(byFilter, sortBy);
  }, [sideFilter, sortBy]);

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6 pb-20">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2
          className="text-xl font-bold tracking-wider text-neutral-200"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          WEAPONS DATABASE
        </h2>

        <div className="flex items-center gap-3">
          {/* Sort button */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setSortOpen((p) => !p)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                sortOpen
                  ? "bg-[#2a2a2a] border-[#444] text-neutral-200"
                  : "bg-[#1a1a1a] border-[#2a2a2a] text-neutral-400 hover:text-neutral-200 hover:border-[#444]"
              }`}
              title="Sort weapons"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M6 12h12M9 18h6" />
              </svg>
              <span className="hidden sm:inline">{SORT_LABELS[sortBy]}</span>
            </button>

            {sortOpen && (
              <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg py-1 min-w-[160px] z-50 shadow-xl">
                {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setSortBy(opt);
                      setSortOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      sortBy === opt
                        ? "text-red-400 bg-red-500/10"
                        : "text-neutral-400 hover:text-neutral-200 hover:bg-[#222]"
                    }`}
                  >
                    {SORT_LABELS[opt]}
                  </button>
                ))}
              </div>
            )}
          </div>

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
