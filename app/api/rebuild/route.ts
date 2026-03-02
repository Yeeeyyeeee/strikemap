import { NextResponse } from "next/server";
import { seedIfEmpty, mergeIncidents, getAllIncidents, deduplicateStore, reAttributeSides } from "@/lib/incidentStore";
import { scrapeChannelDeep, isIranRelated, getConfiguredChannels, postToIncident } from "@/lib/telegram";
import { enrichWithKeywords } from "@/lib/keywordEnricher";
import { applyEnrichment } from "@/lib/enrichmentUtils";
import { fetchSheetData } from "@/lib/fetchSheetData";
import { resetDebounce } from "@/lib/refresh";
import { requireCronAuth } from "@/lib/apiAuth";
import { Incident } from "@/lib/types";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    // 1. Seed baseline sample data (lazy-loaded)
    const { SAMPLE_INCIDENTS } = await import("@/lib/sampleData");
    await seedIfEmpty(SAMPLE_INCIDENTS);
    await resetDebounce();

    // 2. Fetch sheet data
    let sheetCount = 0;
    try {
      const sheetData = await fetchSheetData();
      if (sheetData.length > 0) {
        sheetCount = await mergeIncidents(sheetData);
      }
    } catch (err) {
      console.warn("[rebuild] Sheet fetch failed:", err);
    }

    // 3. Deep-scrape all Telegram channels using keyword enrichment (no AI, instant)
    const channels = getConfiguredChannels();

    const allIncidents: Incident[] = [];

    for (const ch of channels) {
      try {
        const posts = await scrapeChannelDeep(ch, 10);
        for (const post of posts) {
          const inc = postToIncident(post);

          // Use keyword enrichment (instant, no API call)
          if (isIranRelated(post.text)) {
            const kwResult = enrichWithKeywords(post.text);
            if (kwResult) {
              applyEnrichment(inc, kwResult);
            }
          }

          allIncidents.push(inc);
        }
        console.log(`[rebuild] ${ch}: scraped ${posts.length} posts`);
      } catch (err) {
        console.warn(`[rebuild] ${ch} failed:`, err);
      }
    }

    const telegramAdded = await mergeIncidents(allIncidents);

    // Deduplicate: remove incidents from different channels reporting the same strike
    const deduped = await deduplicateStore();

    // Re-attribute sides on ALL stored incidents using location-based logic
    const reAttributed = await reAttributeSides();

    const all = await getAllIncidents();

    return NextResponse.json({
      ok: true,
      sheetAdded: sheetCount,
      telegramScraped: allIncidents.length,
      telegramAdded,
      deduplicatesRemoved: deduped,
      sidesReAttributed: reAttributed,
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
