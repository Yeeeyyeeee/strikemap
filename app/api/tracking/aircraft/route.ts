/**
 * GET /api/tracking/aircraft
 * Returns military aircraft GeoJSON + count.
 */

import { NextResponse } from "next/server";
import { getMilitaryAircraft, aircraftToGeoJSON } from "@/lib/aircraft";

export async function GET() {
  try {
    const aircraft = await getMilitaryAircraft();
    const geojson = aircraftToGeoJSON(aircraft);

    return NextResponse.json(
      { geojson, count: aircraft.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (err) {
    console.error("[api/tracking/aircraft] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch aircraft data" },
      { status: 500 }
    );
  }
}
