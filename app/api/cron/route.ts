import { NextResponse } from "next/server";
import { seedIfEmpty } from "@/lib/incidentStore";
import { refreshLiveData } from "@/lib/refresh";
import { requireCronAuth } from "@/lib/apiAuth";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const { SAMPLE_INCIDENTS } = await import("@/lib/sampleData");
    await seedIfEmpty(SAMPLE_INCIDENTS);
    const added = await refreshLiveData();

    return NextResponse.json({
      ok: true,
      added,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron] Failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
