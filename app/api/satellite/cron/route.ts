/**
 * GET /api/satellite/cron
 * Authenticated cron endpoint to refresh FIRMS cache.
 * Triggered every 10 minutes by Vercel Cron.
 */

import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/apiAuth";
import { refreshFIRMSCache } from "@/lib/firms";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const authErr = requireCronAuth(request);
  if (authErr) return authErr;

  try {
    const count = await refreshFIRMSCache();
    return NextResponse.json({
      ok: true,
      hotspots: count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[satellite/cron] Error:", err);
    return NextResponse.json(
      { error: "FIRMS refresh failed" },
      { status: 500 },
    );
  }
}
