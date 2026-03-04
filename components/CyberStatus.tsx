"use client";

import { memo, useState, useEffect, useCallback } from "react";

interface CountryStatus {
  code: string;
  name: string;
  status: "normal" | "restricted" | "blackout";
  changePercent: number;
}

interface CyberData {
  countries: CountryStatus[];
  timestamp: number;
}

const STATUS_CONFIG = {
  normal: { label: "NORMAL", color: "#22c55e" },
  restricted: { label: "RESTRICTED", color: "#eab308" },
  blackout: { label: "BLACKOUT", color: "#ef4444" },
} as const;

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default memo(function CyberStatus() {
  const [data, setData] = useState<CyberData | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/cyber-status");
      if (!res.ok) throw new Error(`${res.status}`);
      const json: CyberData = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="w-full px-3 py-2.5">
      <h3
        className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Internet Connectivity
      </h3>

      <div className="space-y-1">
        {!data &&
          !error &&
          // Skeleton loading
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-700 animate-pulse" />
                <span className="w-12 h-2.5 rounded bg-neutral-800 animate-pulse" />
              </div>
              <span className="w-14 h-3 rounded bg-neutral-800 animate-pulse" />
            </div>
          ))}

        {error && !data && (
          <div className="text-[10px] text-neutral-600 text-center py-2">Offline</div>
        )}

        {data?.countries.map((country) => {
          const cfg = STATUS_CONFIG[country.status];
          return (
            <div key={country.code} className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                <span
                  className="text-[10px] text-neutral-400 uppercase tracking-wider"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  {country.name}
                </span>
              </div>
              <span
                className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                style={{
                  color: cfg.color,
                  background: `${cfg.color}20`,
                  border: `1px solid ${cfg.color}30`,
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {data && (
        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#2a2a2a]/50">
          <span className="text-[9px] text-neutral-600">{relativeTime(data.timestamp)}</span>
          <span
            className="text-[8px] text-neutral-600 uppercase tracking-widest"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            IODA
          </span>
        </div>
      )}
    </div>
  );
});
