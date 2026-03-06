import { NextResponse } from "next/server";

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  timestamp: string;
}

const FJ_RSS_URL = "https://www.financialjuice.com/feed.ashx?xy=rss";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(FJ_RSS_URL, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StrikeMap/1.0; +https://strikemap.live)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ items: [], error: "RSS fetch failed" }, { status: 502 });
    }

    const xml = await res.text();

    // Detect Cloudflare block pages
    if (!xml.includes("<item>") && !xml.includes("<item ")) {
      console.error("[news] RSS response is not valid XML (possible Cloudflare block)");
      return NextResponse.json({ items: [], error: "RSS blocked" }, { status: 502 });
    }

    // Parse RSS items from XML
    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        || block.match(/<title>(.*?)<\/title>/)?.[1]
        || "";
      const link = block.match(/<link>(.*?)<\/link>/)?.[1] || "";
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
      const guid = block.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1] || "";

      if (!title) continue;

      // Strip "FinancialJuice: " prefix from titles
      const cleanTitle = title.trim().replace(/^FinancialJuice:\s*/i, "");

      items.push({
        id: guid || `fj-${Date.parse(pubDate) || items.length}`,
        title: cleanTitle,
        link: link.trim(),
        pubDate,
        timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { items, count: items.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
        },
      }
    );
  } catch (err) {
    console.error("[news] RSS fetch error:", err);
    return NextResponse.json({ items: [], error: "Internal error" }, { status: 500 });
  }
}
