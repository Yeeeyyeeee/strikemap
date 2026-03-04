import { NextResponse } from "next/server";
import { createHash } from "crypto";
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

    // Build a content-aware ETag so clients detect casualty/side changes, not just count
    const idString = incidents
      .map((i) => `${i.id}:${i.casualties_military || 0}:${i.casualties_civilian || 0}:${i.side}`)
      .join(",");
    const hash = createHash("md5").update(idString).digest("hex").slice(0, 12);
    const etag = `"inc-${incidents.length}-${hash}"`;

    return NextResponse.json(
      { incidents, count: incidents.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=15",
          ETag: etag,
        },
      }
    );
  } catch (err) {
    console.error("[incidents] Failed:", err);
    return NextResponse.json({ incidents: [], count: 0, error: String(err) }, { status: 500 });
  }
}
