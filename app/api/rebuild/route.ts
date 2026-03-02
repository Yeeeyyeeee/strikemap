import { NextResponse } from "next/server";
import { seedIfEmpty, mergeIncidents, getAllIncidents, deduplicateStore, reAttributeSides } from "@/lib/incidentStore";
import { SAMPLE_INCIDENTS } from "@/lib/sampleData";
import { scrapeChannelDeep, isIranRelated } from "@/lib/telegram";
import { enrichWithKeywords } from "@/lib/keywordEnricher";
import { fetchSheetData } from "@/lib/fetchSheetData";
import { resetDebounce } from "@/lib/refresh";
import { Incident, MediaItem } from "@/lib/types";

export const maxDuration = 60;

export async function GET() {
  try {
    // 1. Seed baseline sample data (in-memory only)
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
    const channels = (process.env.TELEGRAM_CHANNELS || "")
      .split(",")
      .map((c) => c.trim().replace(/^@/, ""))
      .filter(Boolean);

    const allIncidents: Incident[] = [];

    for (const ch of channels) {
      try {
        const posts = await scrapeChannelDeep(ch, 10);
        for (const post of posts) {
          const msgId = post.id.split("/").pop() || "";
          const inc: Incident = {
            id: `tg-${post.id.replace("/", "-")}`,
            date: post.date || new Date().toISOString().split("T")[0],
            timestamp: post.timestamp || new Date().toISOString(),
            location: "",
            lat: 0,
            lng: 0,
            description: `[${post.channelUsername}] ${post.text.slice(0, 200)}${post.text.length > 200 ? "..." : ""}`,
            details: post.text,
            weapon: "",
            target_type: "",
            video_url: post.videoUrl,
            source_url: `https://t.me/${post.channelUsername}/${msgId}`,
            source: "telegram",
            side: "iran",
            target_military: false,
            telegram_post_id: `${post.channelUsername}/${msgId}`,
            media: (() => {
              const m: MediaItem[] = [];
              if (post.videoUrl) m.push({ type: "video", url: post.videoUrl });
              for (const url of post.imageUrls || []) m.push({ type: "image", url });
              return m.length > 0 ? m : undefined;
            })(),
          };

          // Use keyword enrichment (instant, no API call)
          if (isIranRelated(post.text)) {
            const kwResult = enrichWithKeywords(post.text);
            if (kwResult) {
              inc.location = kwResult.location;
              inc.lat = kwResult.lat;
              inc.lng = kwResult.lng;
              inc.weapon = kwResult.weapon || "";
              inc.target_type = kwResult.target_type || "";
              inc.side = kwResult.side;
              inc.target_military = kwResult.target_military;
              if (kwResult.intercepted_by) inc.intercepted_by = kwResult.intercepted_by;
              if (kwResult.intercept_success != null) inc.intercept_success = kwResult.intercept_success;
              if (kwResult.missiles_fired) inc.missiles_fired = kwResult.missiles_fired;
              if (kwResult.missiles_intercepted) inc.missiles_intercepted = kwResult.missiles_intercepted;
              if (kwResult.casualties_military) inc.casualties_military = kwResult.casualties_military;
              if (kwResult.casualties_civilian) inc.casualties_civilian = kwResult.casualties_civilian;
              if (kwResult.casualties_description && kwResult.casualties_description !== "No casualties reported") {
                inc.casualties_description = kwResult.casualties_description;
              }
              if (kwResult.damage_assessment) inc.damage_assessment = kwResult.damage_assessment;
              if (kwResult.damage_severity) inc.damage_severity = kwResult.damage_severity as Incident["damage_severity"];
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
