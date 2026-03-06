import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getAllIncidents, seedIfEmpty } from "@/lib/incidentStore";
import { refreshLiveData } from "@/lib/refresh";
import { fetchTzevAdomAlerts } from "@/lib/tzevaadom";
import { getInterceptionOutcomes } from "@/lib/interceptionOutcome";
import { getActiveSirenAlerts } from "@/lib/sirenDetector";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    // Seed with sample data if store is empty (first deploy)
    const { SAMPLE_INCIDENTS } = await import("@/lib/sampleData");
    await seedIfEmpty(SAMPLE_INCIDENTS);

    // Debounced refresh — most calls skip this (~50ms)
    await refreshLiveData();

    // Fetch all three datasets in parallel
    const [incidents, alerts, outcomes, sirenAlerts] = await Promise.all([
      getAllIncidents(),
      fetchTzevAdomAlerts(),
      getInterceptionOutcomes(),
      getActiveSirenAlerts(),
    ]);

    // Build ETag from all datasets
    const incidentHash = incidents
      .map((i) => `${i.id}:${i.casualties_military || 0}:${i.casualties_civilian || 0}:${i.side}`)
      .join(",");
    const alertHash = alerts.map((a) => a.id).join(",");
    const sirenHash = sirenAlerts.map((s) => `${s.id}:${s.country}`).join(",");
    const outcomeHash = outcomes.map((o) => o.id).join(",");

    const combined = `${incidentHash}|${alertHash}|${sirenHash}|${outcomeHash}`;
    const hash = createHash("md5").update(combined).digest("hex").slice(0, 16);
    const etag = `"poll-${hash}"`;

    // Check If-None-Match
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag },
      });
    }

    return NextResponse.json(
      {
        incidents,
        incidentCount: incidents.length,
        alerts,
        outcomes,
        sirenAlerts,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=4, stale-while-revalidate=2",
          ETag: etag,
        },
      }
    );
  } catch (err) {
    console.error("[poll] Failed:", err);
    return NextResponse.json(
      { incidents: [], incidentCount: 0, alerts: [], outcomes: [], sirenAlerts: [], error: String(err) },
      { status: 500 }
    );
  }
}
