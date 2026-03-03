/**
 * GET /api/satellite/firms
 * Returns FIRMS thermal hotspot GeoJSON + summary counts.
 * 5-min CDN cache.
 */

import { NextResponse } from "next/server";
import { getFIRMSHotspots, hotspotsToGeoJSON } from "@/lib/firms";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const hotspots = await getFIRMSHotspots();
    const geojson = hotspotsToGeoJSON(hotspots);

    const correlated = hotspots.filter((h) => h.correlatedIncidentId).length;

    return NextResponse.json(
      {
        geojson,
        counts: {
          total: hotspots.length,
          correlated,
          uncorrelated: hotspots.length - correlated,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    console.error("[api/satellite/firms] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch FIRMS data" },
      { status: 500 },
    );
  }
}
