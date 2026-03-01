import { NextResponse } from "next/server";
import { scrapeChannel } from "@/lib/telegram";

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
      .slice(0, 100); // Latest 100 posts

    return NextResponse.json(
      { posts, count: posts.length },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch {
    return NextResponse.json({ posts: [], error: "Scrape failed" });
  }
}
