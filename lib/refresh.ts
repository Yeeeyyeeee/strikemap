import { mergeIncidents } from "./incidentStore";
import { fetchSheetData } from "./fetchSheetData";
import { fetchRSSIncidents } from "./rss";
import { fetchTelegramIncidents } from "./telegram";
import { getRedis } from "./redis";
import { REFRESH_INTERVAL_MS, REDIS_REFRESH_KEY, SHEET_FETCH_TIMEOUT_MS, RSS_FETCH_TIMEOUT_MS, TELEGRAM_FETCH_TIMEOUT_MS } from "./constants";

let refreshing = false;

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
  if (r) await r.del(REDIS_REFRESH_KEY).catch(() => {});
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
      const lastRefresh = await r.get<number>(REDIS_REFRESH_KEY);
      if (lastRefresh && Date.now() - lastRefresh < REFRESH_INTERVAL_MS) {
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
      await r.set(REDIS_REFRESH_KEY, Date.now()).catch(() => {});
    }

    const [sheetData, rssData, telegramData] = await Promise.all([
      withTimeout(fetchSheetData(), SHEET_FETCH_TIMEOUT_MS).catch((err) => {
        console.warn(`[refresh] Sheet fetch failed: ${err?.message || err}`);
        return [] as Awaited<ReturnType<typeof fetchSheetData>>;
      }),
      withTimeout(fetchRSSIncidents(), RSS_FETCH_TIMEOUT_MS).catch((err) => {
        console.warn(`[refresh] RSS fetch failed: ${err?.message || err}`);
        return [] as Awaited<ReturnType<typeof fetchRSSIncidents>>;
      }),
      withTimeout(fetchTelegramIncidents(), TELEGRAM_FETCH_TIMEOUT_MS).catch((err) => {
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
