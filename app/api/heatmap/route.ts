import { NextRequest, NextResponse } from "next/server";
import { getAllIncidents } from "@/lib/incidentStore";

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasMedia(i: { media?: { type: string; url: string }[]; video_url?: string; telegram_post_id?: string; source_url?: string }): boolean {
  if (i.media && i.media.length > 0) return true;
  if (i.video_url) return true;
  if (i.telegram_post_id) return true;
  if (i.source_url && /t\.me\/\w+\/\d+/.test(i.source_url)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const allIncidents = await getAllIncidents();
  // Only include incidents with media (images/videos)
  const incidents = allIncidents.filter(hasMedia);
  const url = req.nextUrl;
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");
  const radius = parseFloat(url.searchParams.get("radius") || "50");

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
}
