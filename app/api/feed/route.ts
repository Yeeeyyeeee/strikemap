import { NextResponse } from "next/server";
import { scrapeChannel, isIranRelated, getConfiguredChannels } from "@/lib/telegram";
import { enrichWithKeywords } from "@/lib/keywordEnricher";
import { processSirenPosts } from "@/lib/sirenDetector";

export const maxDuration = 30;

export async function GET() {
  const channels = getConfiguredChannels();

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

    // Process posts for siren detection (populates server-side state)
    processSirenPosts(posts);

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
      {
        headers: {
          // CDN caches for 30s — Telegram doesn't update faster than this
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch {
    return NextResponse.json({ posts: [], error: "Scrape failed" });
  }
}
