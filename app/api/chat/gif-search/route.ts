import { NextRequest, NextResponse } from "next/server";

const GIPHY_API_BASE = "https://api.giphy.com/v1/gifs";

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyResult {
  id: string;
  images: {
    original?: GiphyImage;
    fixed_width_small?: GiphyImage;
    fixed_width?: GiphyImage;
  };
}

function mapGiphyResponse(data: { data?: GiphyResult[]; pagination?: { offset: number; total_count: number; count: number } }) {
  return {
    results: (data.data || []).map((r) => ({
      id: r.id,
      gif: r.images?.original?.url || r.images?.fixed_width?.url || "",
      preview: r.images?.fixed_width_small?.url || r.images?.fixed_width?.url || "",
      width: parseInt(r.images?.original?.width || "200") || 200,
      height: parseInt(r.images?.original?.height || "200") || 200,
    })),
    next: String((data.pagination?.offset ?? 0) + (data.pagination?.count ?? 0)),
  };
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GIF search not configured" }, { status: 503 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const offset = req.nextUrl.searchParams.get("pos") || "0";

  const endpoint = q ? "search" : "trending";
  const params = new URLSearchParams({
    api_key: apiKey,
    limit: "20",
    rating: "pg-13",
    offset,
  });
  if (q) params.set("q", q);

  const res = await fetch(`${GIPHY_API_BASE}/${endpoint}?${params}`);
  if (!res.ok) {
    return NextResponse.json({ results: [], next: "" }, { status: 200 });
  }

  const data = await res.json();
  const cacheSeconds = q ? 30 : 60;
  return NextResponse.json(mapGiphyResponse(data), {
    headers: { "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}` },
  });
}
