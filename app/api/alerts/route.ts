import { NextRequest, NextResponse } from "next/server";
import { fetchTzevAdomAlerts, fetchTzevAdomAlertsDebug, addManualAlert, clearAlert, clearAllManualAlerts } from "@/lib/tzevaadom";
import { getInterceptionOutcomes } from "@/lib/interceptionOutcome";
import { isAdminRequest } from "@/lib/adminAuth";
import { geocodeIsraeliLocation } from "@/lib/israelGeocode";
import { selectLaunchOrigin } from "@/lib/launchSites";

const EXTRA_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  "kuwait": { lat: 29.3759, lng: 47.9774 },
  "kuwait city": { lat: 29.3759, lng: 47.9774 },
  "iran": { lat: 35.6892, lng: 51.3890 },
  "tehran": { lat: 35.6892, lng: 51.3890 },
  "isfahan": { lat: 32.6546, lng: 51.6680 },
  "tabriz": { lat: 38.0800, lng: 46.2919 },
  "shiraz": { lat: 29.5918, lng: 52.5837 },
  "bushehr": { lat: 28.9234, lng: 50.8203 },
  "bandar abbas": { lat: 27.1865, lng: 56.2808 },
  "iraq": { lat: 33.3152, lng: 44.3661 },
  "baghdad": { lat: 33.3152, lng: 44.3661 },
  "erbil": { lat: 36.1912, lng: 44.0119 },
  "basra": { lat: 30.5085, lng: 47.7804 },
  "syria": { lat: 33.5138, lng: 36.2765 },
  "damascus": { lat: 33.5138, lng: 36.2765 },
  "aleppo": { lat: 36.2021, lng: 37.1343 },
  "lebanon": { lat: 33.8938, lng: 35.5018 },
  "beirut": { lat: 33.8938, lng: 35.5018 },
  "yemen": { lat: 15.3694, lng: 44.1910 },
  "sanaa": { lat: 15.3694, lng: 44.1910 },
  "hodeidah": { lat: 14.7979, lng: 42.9531 },
  "aden": { lat: 12.7855, lng: 45.0187 },
  "gaza": { lat: 31.5017, lng: 34.4668 },
  "rafah": { lat: 31.2969, lng: 34.2455 },
  "jordan": { lat: 31.9454, lng: 35.9284 },
  "amman": { lat: 31.9454, lng: 35.9284 },
  "saudi arabia": { lat: 24.7136, lng: 46.6753 },
  "riyadh": { lat: 24.7136, lng: 46.6753 },
  "jeddah": { lat: 21.4858, lng: 39.1925 },
  "uae": { lat: 24.4539, lng: 54.3773 },
  "dubai": { lat: 25.2048, lng: 55.2708 },
  "abu dhabi": { lat: 24.4539, lng: 54.3773 },
  "bahrain": { lat: 26.0667, lng: 50.5577 },
  "qatar": { lat: 25.2854, lng: 51.5310 },
  "doha": { lat: 25.2854, lng: 51.5310 },
  "turkey": { lat: 39.9334, lng: 32.8597 },
  "ankara": { lat: 39.9334, lng: 32.8597 },
  "pakistan": { lat: 33.6844, lng: 73.0479 },
  "islamabad": { lat: 33.6844, lng: 73.0479 },
};

export async function GET(req: NextRequest) {
  const debug = req.nextUrl.searchParams.get("debug") === "1";

  try {
    if (debug) {
      const result = await fetchTzevAdomAlertsDebug();
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const [alerts, outcomes] = await Promise.all([
      fetchTzevAdomAlerts(),
      getInterceptionOutcomes(),
    ]);
    return NextResponse.json(
      { alerts, outcomes },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3, stale-while-revalidate=5",
        },
      }
    );
  } catch (err) {
    return NextResponse.json({ alerts: [], outcomes: [], error: String(err) });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action } = body;

  if (action === "add") {
    const { target, threatType = "missile", timeToImpact = 90, origin: originCountry } = body;
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
        // Geocode city name — try Israeli locations first, then broader Middle East
        const targetStr = String(target);
        const coords = geocodeIsraeliLocation(targetStr) || EXTRA_LOCATIONS[targetStr.toLowerCase().trim()];
        if (!coords) {
          return NextResponse.json({ error: `Could not geocode "${target}"` }, { status: 400 });
        }
        lat = coords.lat;
        lng = coords.lng;
        cityName = targetStr;
      }
    }

    const origin = selectLaunchOrigin(lat, lng, threatType, timeToImpact, originCountry);
    const id = `manual-${Date.now()}`;
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    await addManualAlert({
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
      threatClass: origin.threatClass,
      originName: origin.siteName,
    });

    return NextResponse.json({ ok: true, id });
  }

  if (action === "clear") {
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await clearAlert(id);
    return NextResponse.json({ ok: true });
  }

  if (action === "clear-all") {
    await clearAllManualAlerts();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
