import { NextResponse } from "next/server";
import { getAllIncidents, seedIfEmpty } from "@/lib/incidentStore";
import { SAMPLE_INCIDENTS } from "@/lib/sampleData";
import { refreshLiveData } from "@/lib/refresh";

// Seed on first import
seedIfEmpty(SAMPLE_INCIDENTS);

export async function GET() {
  // Await refresh on every request (debounced internally to once per minute).
  // On Hobby plan cron only runs daily, so client polling drives updates.
  await refreshLiveData();

  const incidents = getAllIncidents();

  return NextResponse.json(
    { incidents, count: incidents.length },
    {
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
      },
    }
  );
}
