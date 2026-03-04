import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { REDIS_CYBER_STATUS_KEY } from "@/lib/constants";

interface CountryStatus {
  code: string;
  name: string;
  status: "normal" | "restricted" | "blackout";
  changePercent: number;
}

interface CyberStatusResponse {
  countries: CountryStatus[];
  timestamp: number;
}

const COUNTRIES = [
  { code: "IR", name: "Iran" },
  { code: "IL", name: "Israel" },
  { code: "IQ", name: "Iraq" },
  { code: "LB", name: "Lebanon" },
  { code: "SY", name: "Syria" },
  { code: "YE", name: "Yemen" },
];

const IODA_BASE = "https://api.ioda.inetintel.cc.gatech.edu/v2";
const CACHE_TTL_S = 300; // 5 minutes

async function fetchCountryStatus(code: string): Promise<{ changePercent: number; hasOutageEvent: boolean }> {
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;
  const oneDayAgo = now - 86400;

  // Fetch ping signal (7d for baseline) and outage events in parallel
  const [signalRes, eventsRes] = await Promise.all([
    fetch(`${IODA_BASE}/signals/raw/country/${code}?from=${sevenDaysAgo}&until=${now}&datasource=ping-slash24&maxPoints=168`, {
      signal: AbortSignal.timeout(10000),
    }).catch(() => null),
    fetch(`${IODA_BASE}/outages/events?entityType=country&entityCode=${code}&from=${oneDayAgo}&until=${now}&limit=10`, {
      signal: AbortSignal.timeout(10000),
    }).catch(() => null),
  ]);

  let changePercent = 0;
  let hasOutageEvent = false;

  // Parse ping-slash24 signal — compare current to 7-day peak (normal level)
  if (signalRes?.ok) {
    try {
      const json = await signalRes.json();
      const series = json?.data?.[0]?.[0];
      if (series?.values) {
        const values: number[] = series.values.filter((v: number | null) => v != null && v > 0);
        if (values.length >= 6) {
          // Peak = top 10% of values (represents normal connectivity)
          const sorted = [...values].sort((a, b) => b - a);
          const topCount = Math.max(3, Math.floor(sorted.length * 0.1));
          const peak = sorted.slice(0, topCount).reduce((a, b) => a + b, 0) / topCount;

          // Current = average of last 3 available values
          const recent = values.slice(-3);
          const current = recent.reduce((a, b) => a + b, 0) / recent.length;

          if (peak > 0) {
            changePercent = Math.round(((current - peak) / peak) * 100);
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Parse outage events — check for high-score active events
  if (eventsRes?.ok) {
    try {
      const json = await eventsRes.json();
      const events = json?.data;
      if (Array.isArray(events)) {
        hasOutageEvent = events.some(
          (e: { score?: number; datasource?: string }) =>
            (e.score ?? 0) > 1000 &&
            e.datasource !== "merit-nt" // merit-nt can be noisy, prioritize ping
        );
        // Also check for very high merit-nt scores
        if (!hasOutageEvent) {
          hasOutageEvent = events.some(
            (e: { score?: number }) => (e.score ?? 0) > 50000
          );
        }
      }
    } catch { /* ignore */ }
  }

  return { changePercent, hasOutageEvent };
}

function classify(changePercent: number, hasOutageEvent: boolean): "normal" | "restricted" | "blackout" {
  // Blackout: >80% drop from normal peak
  if (changePercent <= -80) {
    return "blackout";
  }
  // Blackout: >50% drop with confirmed outage events
  if (changePercent <= -50 && hasOutageEvent) {
    return "blackout";
  }
  // Restricted: 20-80% drop or outage events detected
  if (changePercent <= -20 || (hasOutageEvent && changePercent <= -10)) {
    return "restricted";
  }
  return "normal";
}

async function fetchAllStatuses(): Promise<CyberStatusResponse> {
  const results = await Promise.all(
    COUNTRIES.map(async ({ code, name }) => {
      try {
        const { changePercent, hasOutageEvent } = await fetchCountryStatus(code);
        return {
          code,
          name,
          status: classify(changePercent, hasOutageEvent),
          changePercent,
        };
      } catch {
        return { code, name, status: "normal" as const, changePercent: 0 };
      }
    })
  );

  return { countries: results, timestamp: Date.now() };
}

export async function GET() {
  try {
    const r = getRedis();

    // Check cache
    if (r) {
      try {
        const cached = await r.get(REDIS_CYBER_STATUS_KEY) as string | null;
        if (cached) {
          const data: CyberStatusResponse = typeof cached === "string" ? JSON.parse(cached) : cached;
          if (Date.now() - data.timestamp < CACHE_TTL_S * 1000) {
            return NextResponse.json(data, {
              headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
            });
          }
        }
      } catch { /* cache miss */ }
    }

    // Fetch fresh data
    const data = await fetchAllStatuses();

    // Cache
    if (r) {
      r.set(REDIS_CYBER_STATUS_KEY, JSON.stringify(data), { ex: CACHE_TTL_S }).catch(() => {});
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (err) {
    return NextResponse.json(
      { countries: COUNTRIES.map((c) => ({ ...c, status: "normal", changePercent: 0 })), timestamp: Date.now(), error: String(err) },
      { status: 200 }
    );
  }
}
