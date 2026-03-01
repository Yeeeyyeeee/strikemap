import { NextResponse } from "next/server";
import { seedIfEmpty } from "@/lib/incidentStore";
import { SAMPLE_INCIDENTS } from "@/lib/sampleData";
import { refreshLiveData } from "@/lib/refresh";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await seedIfEmpty(SAMPLE_INCIDENTS);
  const added = await refreshLiveData();

  return NextResponse.json({
    ok: true,
    added,
    timestamp: new Date().toISOString(),
  });
}
