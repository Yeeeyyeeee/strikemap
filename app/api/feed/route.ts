import { NextResponse } from "next/server";
import { scrapeChannel, isIranRelated } from "@/lib/telegram";
import { enrichWithKeywords } from "@/lib/keywordEnricher";

export const maxDuration = 30;

export async function GET() {
  const channels = (process.env.TELEGRAM_CHANNELS || "")
    .split(",")
    .map((c) => c.trim().replace(/^@/, ""))
    .filter(Boolean);

  if (channels.length === 0) {
    return NextResponse.json({ posts: [], error: "No channels configured" });
  }

  try {
    const results = await Promise.all(
      channels.map((ch) =>
        scrapeChannel(ch).catch(() => [])
      )
    );

    const posts = results
      .flat()
      .filter((p) => p.text)
      .sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
      .slice(0, 100);

    // Enrich Iran-related posts with coordinates so feed clicks can navigate the map
    for (const post of posts) {
      if (isIranRelated(post.text)) {
        const kwResult = enrichWithKeywords(post.text);
        if (kwResult) {
          post.lat = kwResult.lat;
          post.lng = kwResult.lng;
          post.location = kwResult.location;
        }
      }
    }

    return NextResponse.json(
      { posts, count: posts.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ posts: [], error: "Scrape failed" });
  }
}
