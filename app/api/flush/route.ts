import { NextResponse } from "next/server";
import { clearStore, seedIfEmpty, getAllIncidents } from "@/lib/incidentStore";
import { refreshLiveData, resetDebounce } from "@/lib/refresh";
import { requireCronAuth } from "@/lib/apiAuth";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    // 1. Clear all corrupted data from Redis
    await clearStore();

    // 2. Seed with sample data (lazy-loaded to avoid permanent memory use)
    const { SAMPLE_INCIDENTS } = await import("@/lib/sampleData");
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
  } catch (err) {
    console.error("[flush] Failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
