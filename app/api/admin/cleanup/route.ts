import { NextResponse } from "next/server";
import { cleanupUnmapped, getAllIncidents } from "@/lib/incidentStore";
import { requireCronAuth } from "@/lib/apiAuth";

export const maxDuration = 60;

export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const before = (await getAllIncidents()).length;
    const result = await cleanupUnmapped();
    const after = (await getAllIncidents()).length;

    const mapped = (await getAllIncidents()).filter((i) => i.lat !== 0 || i.lng !== 0).length;
    const unmapped = after - mapped;

    return NextResponse.json({
      ok: true,
      before,
      after,
      removedNonIran: result.removedNonIran,
      removedDupes: result.removedDupes,
      totalRemoved: result.removedNonIran + result.removedDupes,
      mapped,
      unmapped,
    });
  } catch (err) {
    console.error("[cleanup] Failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
