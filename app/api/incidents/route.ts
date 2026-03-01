import { NextResponse } from "next/server";
import { getAllIncidents, seedIfEmpty } from "@/lib/incidentStore";
import { SAMPLE_INCIDENTS } from "@/lib/sampleData";
import { refreshLiveData } from "@/lib/refresh";

// Allow up to 60s for Telegram scraping + AI enrichment
export const maxDuration = 60;

export async function GET() {
  // Seed with sample data if store is empty (first ever deploy)
  await seedIfEmpty(SAMPLE_INCIDENTS);

  // Refresh live data (debounced internally to once per minute).
  // Most requests skip this and just read from Redis (~50ms).
  // Once per minute, one request triggers a full refresh (~15-25s).
  await refreshLiveData();

  const incidents = await getAllIncidents();

  return NextResponse.json(
    { incidents, count: incidents.length },
    {
      headers: {
        // Short cache so clients get fresh data quickly
        "Cache-Control": "public, s-maxage=3, stale-while-revalidate=5",
      },
    }
  );
}
