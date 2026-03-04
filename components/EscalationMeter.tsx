"use client";

import { memo, useMemo } from "react";
import { Incident, NOTAM } from "@/lib/types";
import { computeEscalation } from "@/lib/escalationScore";

interface EscalationMeterProps {
  incidents: Incident[];
  notams?: NOTAM[];
}

export default memo(function EscalationMeter({ incidents, notams }: EscalationMeterProps) {
  const result = useMemo(() => computeEscalation(incidents, notams), [incidents, notams]);

  return (
    <div className="w-full p-3">
      <h3
        className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Escalation Level
      </h3>

      <div className="flex items-end gap-3 mb-2">
        {/* Vertical gauge */}
        <div className="relative w-4 h-20 bg-[#2a2a2a] rounded-full overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-700 ease-out"
            style={{
              height: `${result.score}%`,
              backgroundColor: result.color,
              boxShadow: `0 0 8px ${result.color}40`,
            }}
          />
        </div>

        {/* Score + level */}
        <div className="flex-1">
          <div
            className="text-2xl font-bold"
            style={{ color: result.color, fontFamily: "JetBrains Mono, monospace" }}
          >
            {result.score}
          </div>
          <span
            className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded inline-block mt-1"
            style={{
              color: result.color,
              background: `${result.color}20`,
              border: `1px solid ${result.color}30`,
            }}
          >
            {result.level}
          </span>
        </div>
      </div>

      {/* Contributing factors */}
      {result.factors.length > 0 && (
        <div className="space-y-0.5 border-t border-[#2a2a2a] pt-2">
          {result.factors.slice(0, 3).map((factor, i) => (
            <div key={i} className="text-[10px] text-neutral-500 flex items-center gap-1">
              <span
                className="w-1 h-1 rounded-full inline-block"
                style={{ backgroundColor: result.color }}
              />
              {factor}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
