import { NextResponse } from "next/server";
import { seedIfEmpty } from "@/lib/incidentStore";
import { SAMPLE_INCIDENTS } from "@/lib/sampleData";
import { refreshLiveData } from "@/lib/refresh";

// Seed on first import (in case cron fires before any user visit)
seedIfEmpty(SAMPLE_INCIDENTS);

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron (in production)
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const added = await refreshLiveData();

  return NextResponse.json({
    ok: true,
    added,
    timestamp: new Date().toISOString(),
  });
}
