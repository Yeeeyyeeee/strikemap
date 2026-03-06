/**
 * GET /api/tracking/vessels/cron
 * Cron job: connect to aisstream.io WebSocket, collect vessel positions,
 * merge with previous snapshot, store in Redis.
 */

import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/apiAuth";
import { refreshVesselCache } from "@/lib/vessels";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const count = await refreshVesselCache();
    return NextResponse.json({
      ok: true,
      vessels: count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/tracking/vessels/cron] Error:", err);
    return NextResponse.json(
      { error: "Failed to refresh vessel cache" },
      { status: 500 }
    );
  }
}
