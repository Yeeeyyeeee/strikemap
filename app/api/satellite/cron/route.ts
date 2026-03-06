/**
 * GET /api/satellite/cron
 * Authenticated cron endpoint to refresh FIRMS + seismic caches
 * and run verification engine.
 * Triggered every 10 minutes by Vercel Cron.
 */

import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/apiAuth";
import { refreshFIRMSCache } from "@/lib/firms";
import { refreshSeismicCache } from "@/lib/seismic";
import { runVerification } from "@/lib/verification";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const authErr = requireCronAuth(request);
  if (authErr) return authErr;

  try {
    // Refresh FIRMS + seismic caches in parallel
    const [hotspotCount, seismicCount] = await Promise.all([
      refreshFIRMSCache(),
      refreshSeismicCache(),
    ]);

    // Run verification after caches are fresh
    const promoted = await runVerification();

    return NextResponse.json({
      ok: true,
      hotspots: hotspotCount,
      seismic: seismicCount,
      promoted,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[satellite/cron] Error:", err);
    return NextResponse.json(
      { error: "Satellite cron failed" },
      { status: 500 },
    );
  }
}
