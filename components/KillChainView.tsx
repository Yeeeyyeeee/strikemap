"use client";

import { useMemo, memo } from "react";
import { Incident } from "@/lib/types";
import { groupIntoKillChains, KillChainEvent, KillChainStage } from "@/lib/killChainUtils";

interface KillChainViewProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
}

const SIDE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  iran: { label: "IRANIAN", color: "#ef4444", bg: "bg-red-500/10", border: "border-red-500/30" },
  us_israel: { label: "US/ISRAEL", color: "#3b82f6", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  us: { label: "US", color: "#3b82f6", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  israel: { label: "ISRAEL", color: "#06b6d4", bg: "bg-cyan-500/10", border: "border-cyan-500/30" },
};

const SEVERITY_COLORS: Record<string, string> = {
  minor: "#22c55e",
  moderate: "#eab308",
  severe: "#f97316",
  catastrophic: "#ef4444",
};

function StageIcon({ type }: { type: KillChainStage["type"] }) {
  if (type === "launch") {
    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
        <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 3 0 3 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-3 0-3" />
      </svg>
    );
  }
  if (type === "intercept") {
    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  // impact
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function StageNode({
  stage,
  sideColor,
  onClick,
}: {
  stage: KillChainStage;
  sideColor: string;
  onClick: () => void;
}) {
  const typeConfig = {
    launch: { label: "LAUNCH", color: sideColor },
    intercept: { label: "INTERCEPTED", color: "#22c55e" },
    impact: { label: "IMPACT", color: "#ef4444" },
  };

  const cfg = typeConfig[stage.type];

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 min-w-[90px] group"
    >
      <div
        className="w-12 h-12 rounded-lg bg-[#0a0a0a] border flex items-center justify-center transition-all group-hover:scale-110"
        style={{ borderColor: `${cfg.color}50`, color: cfg.color }}
      >
        <StageIcon type={stage.type} />
      </div>
      <span
        className="text-[9px] font-bold uppercase tracking-wider"
        style={{ color: cfg.color }}
      >
        {cfg.label}
      </span>
      <span className="text-[10px] text-neutral-500 text-center leading-tight max-w-[100px]">
        {stage.weapon}
      </span>
    </button>
  );
}

function KillChainCard({
  event,
  onSelectIncident,
}: {
  event: KillChainEvent;
  onSelectIncident: (incident: Incident) => void;
}) {
  const side = SIDE_CONFIG[event.attackerSide];

  return (
    <div className={`${side.bg} border ${side.border} rounded-xl p-5 mb-4`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-bold uppercase px-2 py-1 rounded"
            style={{
              color: side.color,
              background: `${side.color}20`,
              border: `1px solid ${side.color}30`,
            }}
          >
            {side.label}
          </span>
          <span className="text-sm text-neutral-300 font-medium">
            {event.targetLocation}
          </span>
        </div>
        <span
          className="text-xs text-neutral-500"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {event.date}
        </span>
      </div>

      {/* Weapons used */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {event.weapons.map((w) => (
          <span
            key={w}
            className="text-[10px] px-2 py-0.5 rounded bg-[#1a1a1a] border border-[#2a2a2a] text-neutral-400"
          >
            {w}
          </span>
        ))}
      </div>

      {/* Chain visualization */}
      <div className="flex items-start gap-0 overflow-x-auto pb-2 mb-4">
        {event.stages.map((stage, idx) => (
          <div key={`${stage.incident.id}-${stage.type}`} className="flex items-center">
            {idx > 0 && (
              <div className="w-6 md:w-10 h-px border-t-2 border-dashed border-[#333] mt-6 flex-shrink-0" />
            )}
            <StageNode
              stage={stage}
              sideColor={side.color}
              onClick={() => onSelectIncident(stage.incident)}
            />
          </div>
        ))}
      </div>

      {/* Summary row */}
      <div className="flex items-center gap-4 pt-3 border-t border-[#2a2a2a]/50">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-neutral-500">Launched:</span>
          <span
            className="text-[11px] font-bold"
            style={{ color: side.color }}
          >
            {event.totalProjectiles}
          </span>
        </div>
        {event.intercepted > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-neutral-500">Intercepted:</span>
            <span className="text-[11px] font-bold text-green-400">
              {event.intercepted}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-neutral-500">Impacted:</span>
          <span className="text-[11px] font-bold text-red-400">
            {event.impacted}
          </span>
        </div>
        {event.damageSeverity && (
          <span
            className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ml-auto"
            style={{
              color: SEVERITY_COLORS[event.damageSeverity] || "#999",
              background: `${SEVERITY_COLORS[event.damageSeverity] || "#999"}20`,
              border: `1px solid ${SEVERITY_COLORS[event.damageSeverity] || "#999"}30`,
            }}
          >
            {event.damageSeverity}
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(function KillChainView({
  incidents,
  onSelectIncident,
}: KillChainViewProps) {
  const killChains = useMemo(
    () => groupIntoKillChains(incidents),
    [incidents]
  );

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6 pb-20">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h2
            className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-1"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Kill Chain Analysis
          </h2>
          <p className="text-sm text-neutral-600">
            {killChains.length} attack event{killChains.length !== 1 ? "s" : ""} detected
          </p>
        </div>

        {killChains.length === 0 ? (
          <div className="text-center py-20 text-neutral-600">
            No attack events to display
          </div>
        ) : (
          killChains.map((event) => (
            <KillChainCard
              key={event.id}
              event={event}
              onSelectIncident={onSelectIncident}
            />
          ))
        )}
      </div>
    </div>
  );
});
