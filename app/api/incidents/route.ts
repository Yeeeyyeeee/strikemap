import { NextResponse } from "next/server";
import { getAllIncidents, seedIfEmpty } from "@/lib/incidentStore";
import { refreshLiveData } from "@/lib/refresh";

// Allow up to 60s for Telegram scraping + AI enrichment
export const maxDuration = 60;

export async function GET() {
  try {
    // Seed with sample data if store is empty (first ever deploy).
    // Lazy-loaded to avoid keeping 210KB in memory permanently.
    const { SAMPLE_INCIDENTS } = await import("@/lib/sampleData");
    await seedIfEmpty(SAMPLE_INCIDENTS);

    // Refresh live data (debounced internally to once per minute).
    // Most requests skip this and just read from Redis (~50ms).
    // Once per minute, one request triggers a full refresh (~15-25s).
    await refreshLiveData();

    const incidents = await getAllIncidents();

    // Build a lightweight ETag from count + most recent ID so clients
    // that already have the latest data get a fast 304.
    const latest = incidents[0];
    const etag = `"inc-${incidents.length}-${latest?.id || "0"}"`;

    return NextResponse.json(
      { incidents, count: incidents.length },
      {
        headers: {
          // CDN caches for 15s (most polls served from edge), stale OK for 30s more
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
          "ETag": etag,
        },
      }
    );
  } catch (err) {
    console.error("[incidents] Failed:", err);
    return NextResponse.json(
      { incidents: [], count: 0, error: String(err) },
      { status: 500 },
    );
  }
}
