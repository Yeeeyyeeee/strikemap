/**
 * GET /api/tracking/vessels
 * Returns vessel GeoJSON from Redis snapshot + count.
 */

import { NextResponse } from "next/server";
import { getVessels, vesselsToGeoJSON } from "@/lib/vessels";

export async function GET() {
  try {
    const vessels = await getVessels();
    const geojson = vesselsToGeoJSON(vessels);

    return NextResponse.json(
      { geojson, count: vessels.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    console.error("[api/tracking/vessels] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch vessel data" },
      { status: 500 }
    );
  }
}
