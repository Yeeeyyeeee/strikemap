import { NextResponse } from "next/server";
import { after } from "next/server";
import { getAllIncidents, seedIfEmpty } from "@/lib/incidentStore";
import { SAMPLE_INCIDENTS } from "@/lib/sampleData";
import { refreshLiveData } from "@/lib/refresh";

export async function GET() {
  // Seed with sample data if Redis is empty (first ever deploy)
  await seedIfEmpty(SAMPLE_INCIDENTS);

  // Return stored incidents from Redis instantly
  const incidents = await getAllIncidents();

  // Kick off background refresh — runs AFTER response is sent
  after(async () => {
    await refreshLiveData();
  });

  return NextResponse.json(
    { incidents, count: incidents.length },
    {
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
      },
    }
  );
}
