import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Only allow known RSS feed domains
  const allowed = ["financialjuice.com", "rss.app"];
  const parsedUrl = new URL(url);
  if (!allowed.some((d) => parsedUrl.hostname === d || parsedUrl.hostname.endsWith("." + d))) {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "StrikeMap/1.0" },
      next: { revalidate: 300 },
    });
    const text = await res.text();

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch RSS feed" },
      { status: 502 }
    );
  }
}
