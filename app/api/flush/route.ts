import { NextResponse } from "next/server";
import { clearStore, seedIfEmpty, getAllIncidents } from "@/lib/incidentStore";
import { SAMPLE_INCIDENTS } from "@/lib/sampleData";
import { refreshLiveData, resetDebounce } from "@/lib/refresh";

export const maxDuration = 60;

export async function GET() {
  // 1. Clear all corrupted data from Redis
  await clearStore();

  // 2. Seed with sample data
  await seedIfEmpty(SAMPLE_INCIDENTS);

  // 3. Reset debounce and force a fresh scrape
  await resetDebounce();
  const added = await refreshLiveData();

  const incidents = await getAllIncidents();

  return NextResponse.json({
    ok: true,
    cleared: true,
    added,
    total: incidents.length,
    timestamp: new Date().toISOString(),
  });
}
