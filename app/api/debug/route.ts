import { NextResponse } from "next/server";
import { getIncidentCount } from "@/lib/incidentStore";
import { scrapeChannel, isIranRelated } from "@/lib/telegram";

export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    storeSize: getIncidentCount(),
    env: {
      TELEGRAM_CHANNELS: process.env.TELEGRAM_CHANNELS ? `set (${process.env.TELEGRAM_CHANNELS.split(",").length} channels)` : "MISSING",
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "set" : "MISSING",
      NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? "set" : "MISSING",
      NEXT_PUBLIC_FJ_RSS_URL: process.env.NEXT_PUBLIC_FJ_RSS_URL ? "set" : "MISSING",
      NEXT_PUBLIC_SHEET_URL: process.env.NEXT_PUBLIC_SHEET_URL && process.env.NEXT_PUBLIC_SHEET_URL !== "your_published_google_sheet_csv_url_here" ? "set" : "MISSING",
    },
  };

  // Test scraping one channel
  const channels = (process.env.TELEGRAM_CHANNELS || "")
    .split(",")
    .map((c) => c.trim().replace(/^@/, ""))
    .filter(Boolean);

  if (channels.length > 0) {
    const testChannel = channels[0];
    try {
      const posts = await scrapeChannel(testChannel);
      const iranPosts = posts.filter((p) => isIranRelated(p.text));
      diagnostics.telegramTest = {
        channel: testChannel,
        postsScraped: posts.length,
        samplePost: posts[0] ? posts[0].text.slice(0, 100) : "(none)",
        iranRelated: iranPosts.length,
      };
    } catch (err) {
      diagnostics.telegramTest = {
        channel: testChannel,
        error: String(err),
      };
    }
  } else {
    diagnostics.telegramTest = "No channels configured";
  }

  return NextResponse.json(diagnostics, {
    headers: { "Cache-Control": "no-store" },
  });
}
