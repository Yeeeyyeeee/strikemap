"use client";

import { memo, useState, useEffect, useCallback } from "react";
import type { MarketsResponse, MarketTicker as Ticker } from "@/app/api/markets/route";

const LABELS: Record<string, string> = {
  "CL=F": "WTI OIL",
  "BZ=F": "BRENT",
  "GC=F": "GOLD",
  "^VIX": "VIX",
  "DX-Y.NYB": "DXY",
  ITA: "DEFENSE",
};

function formatPrice(symbol: string, price: number): string {
  if (symbol === "^VIX") return price.toFixed(2);
  if (symbol === "DX-Y.NYB") return price.toFixed(2);
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** VIX rising = bad (red), everything else: rising = green */
function getColor(symbol: string, changePercent: number): string {
  const positive = changePercent >= 0;
  if (symbol === "^VIX") return positive ? "#ef4444" : "#22c55e";
  return positive ? "#22c55e" : "#ef4444";
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default memo(function MarketTicker() {
  const [data, setData] = useState<MarketsResponse | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/markets");
      if (!res.ok) throw new Error(`${res.status}`);
      const json: MarketsResponse = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 300_000); // 5 min
    return () => clearInterval(interval);
  }, [fetchData]);

  const marketState = data?.tickers[0]?.marketState ?? "CLOSED";
  const isLive = marketState === "REGULAR";
  const stateLabel = isLive ? "LIVE" : marketState === "PRE" || marketState === "PREPRE" ? "PRE-MKT" : marketState === "POST" || marketState === "POSTPOST" ? "AFTER-HRS" : "CLOSED";

  return (
    <div className="w-full px-3 py-2.5">
      <h3
        className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Market Indicators
      </h3>

      <div className="space-y-1">
        {!data && !error &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-700 animate-pulse" />
                <span className="w-12 h-2.5 rounded bg-neutral-800 animate-pulse" />
              </div>
              <span className="w-16 h-3 rounded bg-neutral-800 animate-pulse" />
            </div>
          ))}

        {error && !data && (
          <div className="text-[10px] text-neutral-600 text-center py-2">Offline</div>
        )}

        {data?.tickers.map((t: Ticker) => {
          const color = getColor(t.symbol, t.changePercent);
          const sign = t.changePercent >= 0 ? "+" : "";
          return (
            <div key={t.symbol} className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span
                  className="text-[10px] text-neutral-400 uppercase tracking-wider"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  {LABELS[t.symbol] ?? t.symbol}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[10px] text-neutral-300 tabular-nums"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  {formatPrice(t.symbol, t.price)}
                </span>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded tabular-nums"
                  style={{
                    color,
                    background: `${color}20`,
                    border: `1px solid ${color}30`,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  {sign}{t.changePercent.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {data && (
        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#2a2a2a]/50">
          <span className="text-[9px] text-neutral-600">
            {relativeTime(data.timestamp)}
          </span>
          <span
            className="text-[8px] uppercase tracking-widest"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              color: isLive ? "#22c55e" : "#737373",
            }}
          >
            {stateLabel}
          </span>
        </div>
      )}
    </div>
  );
});
