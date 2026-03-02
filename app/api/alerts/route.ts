import { NextRequest, NextResponse } from "next/server";
import { fetchTzevAdomAlerts, fetchTzevAdomAlertsDebug, addManualAlert, clearAlert } from "@/lib/tzevaadom";
import { isAdminRequest } from "@/lib/adminAuth";
import { geocodeIsraeliLocation, getOriginForTarget } from "@/lib/israelGeocode";

export async function GET(req: NextRequest) {
  const debug = req.nextUrl.searchParams.get("debug") === "1";

  try {
    if (debug) {
      const result = await fetchTzevAdomAlertsDebug();
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const alerts = await fetchTzevAdomAlerts();
    return NextResponse.json(
      { alerts },
      {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=15",
        },
      }
    );
  } catch (err) {
    return NextResponse.json({ alerts: [], error: String(err) });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action } = body;

  if (action === "add") {
    const { target, threatType = "missile", timeToImpact = 90 } = body;
    if (!target) {
      return NextResponse.json({ error: "target is required" }, { status: 400 });
    }

    // Resolve target to coordinates
    let lat: number;
    let lng: number;
    let cityName: string;

    if (typeof target === "object" && target.lat && target.lng) {
      lat = target.lat;
      lng = target.lng;
      cityName = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    } else {
      // Try parsing "lat,lng" string
      const parts = String(target).split(",").map((s: string) => parseFloat(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        lat = parts[0];
        lng = parts[1];
        cityName = `${lat.toFixed(2)},${lng.toFixed(2)}`;
      } else {
        // Geocode city name
        const coords = geocodeIsraeliLocation(String(target));
        if (!coords) {
          return NextResponse.json({ error: `Could not geocode "${target}"` }, { status: 400 });
        }
        lat = coords.lat;
        lng = coords.lng;
        cityName = String(target);
      }
    }

    const origin = getOriginForTarget(lat, lng, threatType, timeToImpact);
    const id = `manual-${Date.now()}`;
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    addManualAlert({
      id,
      postId: id,
      timestamp,
      regions: [],
      cities: [cityName],
      lat,
      lng,
      originLat: origin.lat,
      originLng: origin.lng,
      timeToImpact,
      status: "active",
      rawText: `Manual Alert: ${cityName} — ${threatType}`,
      threatType,
    });

    return NextResponse.json({ ok: true, id });
  }

  if (action === "clear") {
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    clearAlert(id);
    return NextResponse.json({ ok: true });
  }

  if (action === "clear-all") {
    // Fetch current alerts, clear only manual ones
    const alerts = await fetchTzevAdomAlerts();
    for (const alert of alerts) {
      if (alert.id.startsWith("manual-")) {
        clearAlert(alert.id);
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
