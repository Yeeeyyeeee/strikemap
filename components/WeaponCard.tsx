"use client";

import { WeaponSpec } from "@/lib/weaponsData";

interface WeaponCardProps {
  weapon: WeaponSpec;
  onShowRange?: (lat: number, lng: number, radiusKm: number) => void;
}

const TYPE_COLORS: Record<string, string> = {
  ballistic: "#ef4444",
  cruise: "#f97316",
  drone: "#a855f7",
  guided_bomb: "#3b82f6",
  anti_ship: "#06b6d4",
  hypersonic: "#ec4899",
  interceptor: "#22c55e",
};

const TYPE_LABELS: Record<string, string> = {
  ballistic: "Ballistic",
  cruise: "Cruise",
  drone: "Drone/UAV",
  guided_bomb: "Guided Bomb",
  anti_ship: "Anti-Ship",
  hypersonic: "Hypersonic",
  interceptor: "Interceptor",
};

export default function WeaponCard({ weapon, onShowRange }: WeaponCardProps) {
  const color = TYPE_COLORS[weapon.type] || "#999";
  const sideColor = weapon.side === "iran" ? "#ef4444" : "#3b82f6";

  return (
    <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 hover:border-[#444] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3
            className="text-sm font-bold tracking-wide"
            style={{ color: sideColor, fontFamily: "JetBrains Mono, monospace" }}
          >
            {weapon.name}
          </h3>
          <span
            className="inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded mt-1"
            style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
          >
            {TYPE_LABELS[weapon.type] || weapon.type}
          </span>
        </div>
        {/* Side badge */}
        <span
          className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
          style={{ background: `${sideColor}20`, color: sideColor }}
        >
          {weapon.side === "iran" ? "IRAN" : "US/ISR"}
        </span>
      </div>

      {/* Specs grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mb-3">
        <SpecRow label="Range" value={`${weapon.range_km} km`} />
        <SpecRow label="Speed" value={weapon.speed} />
        <SpecRow
          label="Warhead"
          value={weapon.warhead_kg > 0 ? `${weapon.warhead_kg} kg` : "KKV"}
        />
        <SpecRow label="CEP" value={weapon.cep_m > 0 ? `${weapon.cep_m} m` : "N/A"} />
      </div>

      {/* Description */}
      <p className="text-xs text-neutral-500 leading-relaxed mb-3 line-clamp-3">
        {weapon.description}
      </p>

      {/* Show Range button */}
      {weapon.launchSites.length > 0 && onShowRange && (
        <button
          onClick={() => {
            const site = weapon.launchSites[0];
            onShowRange(site.lat, site.lng, weapon.range_km);
          }}
          className="w-full text-xs font-medium py-1.5 rounded-lg border transition-colors"
          style={{
            borderColor: `${sideColor}40`,
            color: sideColor,
            background: `${sideColor}10`,
          }}
        >
          Show Range on Map
        </button>
      )}
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-600">{label}</span>
      <span className="text-neutral-300 font-mono">{value}</span>
    </div>
  );
}
