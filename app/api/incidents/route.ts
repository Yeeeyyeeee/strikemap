import { NextResponse } from "next/server";
import { getAllIncidents, mergeIncidents, seedIfEmpty } from "@/lib/incidentStore";
import { SAMPLE_INCIDENTS } from "@/lib/sampleData";
import { fetchSheetData } from "@/lib/fetchSheetData";
import { fetchRSSIncidents } from "@/lib/rss";
import { fetchTelegramIncidents } from "@/lib/telegram";

// Seed on first import
seedIfEmpty(SAMPLE_INCIDENTS);

// Background refresh state
let lastRefresh = 0;
const REFRESH_INTERVAL = 60_000; // 1 minute between background refreshes
let refreshing = false;

async function backgroundRefresh() {
  if (refreshing) return;
  const now = Date.now();
  if (now - lastRefresh < REFRESH_INTERVAL) return;

  refreshing = true;
  lastRefresh = now;

  try {
    // Fetch live data with timeouts
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), ms)
        ),
      ]);

    const [sheetData, rssData, telegramData] = await Promise.all([
      withTimeout(fetchSheetData(), 10_000).catch(() => []),
      withTimeout(fetchRSSIncidents(), 15_000).catch(() => []),
      withTimeout(fetchTelegramIncidents(), 15_000).catch(() => []),
    ]);

    // Merge everything into the persistent store
    const allNew = [...sheetData, ...rssData, ...telegramData];
    const added = mergeIncidents(allNew);
    if (added > 0) {
      console.log(`[refresh] Merged ${added} new incidents from live sources`);
    }
  } catch (err) {
    console.error("[refresh] Background refresh failed:", err);
  } finally {
    refreshing = false;
  }
}

export async function GET() {
  // Return stored incidents immediately
  const incidents = getAllIncidents();

  // Trigger background refresh (non-blocking)
  backgroundRefresh();

  return NextResponse.json(
    { incidents, count: incidents.length },
    {
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
      },
    }
  );
}
