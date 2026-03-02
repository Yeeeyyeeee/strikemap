import { NextRequest, NextResponse } from "next/server";
import { getAllIncidents } from "@/lib/incidentStore";
import { haversineKm } from "@/lib/geo";
import { DEFAULT_HEATMAP_RADIUS_KM } from "@/lib/constants";

function hasMedia(i: { media?: { type: string; url: string }[]; video_url?: string }): boolean {
  if (i.media && i.media.length > 0) return true;
  if (i.video_url) return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const allIncidents = await getAllIncidents();
    // Only include incidents with media (images/videos)
    const incidents = allIncidents.filter(hasMedia);
    const url = req.nextUrl;
    const lat = url.searchParams.get("lat");
    const lng = url.searchParams.get("lng");
    const radius = parseFloat(url.searchParams.get("radius") || String(DEFAULT_HEATMAP_RADIUS_KM));

    // If lat/lng provided, return full incident details within radius
    if (lat && lng) {
      const centerLat = parseFloat(lat);
      const centerLng = parseFloat(lng);
      const nearby = incidents.filter((i) => {
        if (i.lat === 0 && i.lng === 0) return false;
        return haversineKm(centerLat, centerLng, i.lat, i.lng) <= radius;
      });
      return NextResponse.json({ incidents: nearby }, { headers: { "Cache-Control": "no-store" } });
    }

    // Default: return lightweight GeoJSON points for heatmap layer
    const features = incidents
      .filter((i) => i.lat !== 0 && i.lng !== 0)
      .map((i) => ({
        type: "Feature" as const,
        properties: {
          id: i.id,
          mediaCount: (i.media?.length || 0) + (i.video_url ? 1 : 0) || 1,
          side: i.side,
          date: i.date,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [i.lng, i.lat],
        },
      }));

    return NextResponse.json(
      {
        points: { type: "FeatureCollection", features },
        count: features.length,
      },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } }
    );
  } catch (err) {
    console.error("[heatmap] Failed:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
