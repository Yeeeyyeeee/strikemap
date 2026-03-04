"use client";

import { memo } from "react";

export function getWeaponColor(weapon: string): string {
  const w = weapon.toLowerCase();
  if (w.includes("drone") || w.includes("shahed")) return "#a855f7";
  return "#ef4444";
}

export default memo(function Legend({
  weapons,
  timelineActive: _timelineActive,
}: {
  weapons: string[];
  timelineActive?: boolean;
}) {
  if (weapons.length === 0) return null;

  const hasIranMissile = weapons.some((w) => {
    const l = w.toLowerCase();
    return !l.includes("drone") && !l.includes("shahed") && !l.includes("airstrike");
  });
  const hasDrone = weapons.some(
    (w) => w.toLowerCase().includes("drone") || w.toLowerCase().includes("shahed")
  );
  const hasAirstrike = weapons.some((w) => w.toLowerCase().includes("airstrike"));

  return (
    <div className="bg-[#1a1a1a]/95 border border-[#2a2a2a] rounded-lg p-3">
      <h3
        className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Strike Type
      </h3>
      <div className="space-y-1.5">
        {hasIranMissile && (
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "#ef4444", boxShadow: "0 0 6px #ef444440" }}
            />
            <span className="text-xs text-neutral-400">Iranian Missile</span>
          </div>
        )}
        {hasDrone && (
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "#a855f7", boxShadow: "0 0 6px #a855f740" }}
            />
            <span className="text-xs text-neutral-400">Iranian Drone</span>
          </div>
        )}
        {hasAirstrike && (
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "#3b82f6", boxShadow: "0 0 6px #3b82f640" }}
            />
            <span className="text-xs text-neutral-400">US/Israeli Airstrike</span>
          </div>
        )}
      </div>
    </div>
  );
});
