/**
 * GET /api/seismic
 * Returns USGS seismic event GeoJSON + summary counts.
 * 5-min CDN cache.
 */

import { NextResponse } from "next/server";
import { getSeismicEvents, seismicToGeoJSON } from "@/lib/seismic";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await getSeismicEvents();
    const geojson = seismicToGeoJSON(events);

    const correlated = events.filter((e) => e.correlatedIncidentId).length;

    return NextResponse.json(
      {
        geojson,
        counts: {
          total: events.length,
          correlated,
          uncorrelated: events.length - correlated,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    console.error("[api/seismic] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch seismic data" },
      { status: 500 },
    );
  }
}
