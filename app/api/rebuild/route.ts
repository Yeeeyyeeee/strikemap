import { NextResponse } from "next/server";
import { seedIfEmpty, mergeIncidents, getAllIncidents } from "@/lib/incidentStore";
import { SAMPLE_INCIDENTS } from "@/lib/sampleData";
import { fetchTelegramIncidentsDeep } from "@/lib/telegram";
import { fetchSheetData } from "@/lib/fetchSheetData";
import { resetDebounce } from "@/lib/refresh";

export const maxDuration = 300; // 5 minutes for deep scrape

export async function GET() {
  try {
    // 1. Seed baseline sample data (in-memory only)
    await seedIfEmpty(SAMPLE_INCIDENTS);

    // 2. Reset debounce so future refreshes work
    await resetDebounce();

    // 3. Fetch sheet data
    let sheetCount = 0;
    try {
      const sheetData = await fetchSheetData();
      if (sheetData.length > 0) {
        sheetCount = await mergeIncidents(sheetData);
      }
    } catch (err) {
      console.warn("[rebuild] Sheet fetch failed:", err);
    }

    // 4. Deep-scrape all Telegram channels (15 pages each = ~300 posts per channel)
    const telegramData = await fetchTelegramIncidentsDeep(15);
    const telegramAdded = await mergeIncidents(telegramData);

    const all = await getAllIncidents();

    return NextResponse.json({
      ok: true,
      sheetAdded: sheetCount,
      telegramScraped: telegramData.length,
      telegramAdded,
      total: all.length,
      withCoords: all.filter((i) => i.lat !== 0 && i.lng !== 0).length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[rebuild] Failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
