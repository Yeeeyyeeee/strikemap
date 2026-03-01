import { NextResponse } from "next/server";
import { fetchRSSIncidents } from "@/lib/rss";

export async function GET() {
  try {
    const incidents = await fetchRSSIncidents();
    return NextResponse.json(
      { incidents },
      {
        headers: {
          "Cache-Control": "public, s-maxage=20, stale-while-revalidate=30",
        },
      }
    );
  } catch {
    return NextResponse.json({ incidents: [], error: "Failed to fetch" });
  }
}
