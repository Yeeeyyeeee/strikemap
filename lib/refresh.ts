import { mergeIncidents } from "./incidentStore";
import { fetchSheetData } from "./fetchSheetData";
import { fetchRSSIncidents } from "./rss";
import { fetchTelegramIncidents } from "./telegram";
import { Redis } from "@upstash/redis";

const REFRESH_INTERVAL = 60_000; // 1 minute between refreshes
let refreshing = false;

function getRedis(): Redis | null {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

/** Reset debounce so next call always refreshes */
export async function resetDebounce(): Promise<void> {
  refreshing = false;
  const r = getRedis();
  if (r) await r.del("lastRefreshAt").catch(() => {});
}

/**
 * Fetch live data from all sources and merge into the store.
 * Debounced to run at most once per minute (tracked in Redis so it
 * works across cold starts and multiple serverless instances).
 */
export async function refreshLiveData(): Promise<number> {
  if (refreshing) return 0;

  // Check last refresh time from Redis (survives cold starts)
  const r = getRedis();
  if (r) {
    try {
      const lastRefresh = await r.get<number>("lastRefreshAt");
      if (lastRefresh && Date.now() - lastRefresh < REFRESH_INTERVAL) {
        return 0; // Recently refreshed by another instance
      }
    } catch {
      // Continue anyway
    }
  }

  refreshing = true;

  try {
    // Mark refresh start in Redis immediately (prevents other instances from also refreshing)
    if (r) {
      await r.set("lastRefreshAt", Date.now()).catch(() => {});
    }

    const [sheetData, rssData, telegramData] = await Promise.all([
      withTimeout(fetchSheetData(), 10_000).catch((err) => {
        console.warn(`[refresh] Sheet fetch failed: ${err?.message || err}`);
        return [] as Awaited<ReturnType<typeof fetchSheetData>>;
      }),
      withTimeout(fetchRSSIncidents(), 15_000).catch((err) => {
        console.warn(`[refresh] RSS fetch failed: ${err?.message || err}`);
        return [] as Awaited<ReturnType<typeof fetchRSSIncidents>>;
      }),
      withTimeout(fetchTelegramIncidents(), 45_000).catch((err) => {
        console.warn(`[refresh] Telegram fetch failed: ${err?.message || err}`);
        return [] as Awaited<ReturnType<typeof fetchTelegramIncidents>>;
      }),
    ]);

    console.log(`[refresh] Fetched: ${sheetData.length} sheet, ${rssData.length} rss, ${telegramData.length} telegram`);

    const allNew = [...sheetData, ...rssData, ...telegramData];
    const added = await mergeIncidents(allNew);
    console.log(`[refresh] Merged ${added} new incidents (${allNew.length} candidates, store deduped)`);
    return added;
  } catch (err) {
    console.error("[refresh] Refresh failed:", err);
    return 0;
  } finally {
    refreshing = false;
  }
}
