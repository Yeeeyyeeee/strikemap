import { mergeIncidents } from "./incidentStore";
import { fetchSheetData } from "./fetchSheetData";
import { fetchRSSIncidents } from "./rss";
import { fetchTelegramIncidents } from "./telegram";

let lastRefresh = 0;
const REFRESH_INTERVAL = 60_000; // 1 minute between refreshes
let refreshing = false;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

/**
 * Fetch live data from all sources and merge into the store.
 * Debounced to run at most once per minute.
 */
export async function refreshLiveData(): Promise<number> {
  if (refreshing) return 0;
  const now = Date.now();
  if (now - lastRefresh < REFRESH_INTERVAL) return 0;

  refreshing = true;
  lastRefresh = now;

  try {
    const [sheetData, rssData, telegramData] = await Promise.all([
      withTimeout(fetchSheetData(), 10_000).catch((err) => {
        console.warn(`[refresh] Sheet fetch failed: ${err?.message || err}`);
        return [] as Awaited<ReturnType<typeof fetchSheetData>>;
      }),
      withTimeout(fetchRSSIncidents(), 15_000).catch((err) => {
        console.warn(`[refresh] RSS fetch failed: ${err?.message || err}`);
        return [] as Awaited<ReturnType<typeof fetchRSSIncidents>>;
      }),
      withTimeout(fetchTelegramIncidents(), 30_000).catch((err) => {
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
