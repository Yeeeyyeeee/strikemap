/**
 * Military aircraft tracking via ADSB.lol.
 * Fetches the /v2/mil endpoint (globally flagged military aircraft),
 * filters to Middle East bounding box, and caches in Redis.
 */

import { getRedis } from "./redis";
import { TrackedAircraft } from "./types";
import { isMilitary } from "./militaryFilters";
import {
  REDIS_AIRCRAFT_KEY,
  AIRCRAFT_CACHE_TTL_S,
  AIRCRAFT_STALE_THRESHOLD_S,
  TRACKING_BBOX,
} from "./constants";

const ADSB_LOL_API = "https://api.adsb.lol/v2";

/** Fetch military aircraft from ADSB.lol and filter to Middle East */
export async function fetchMilitaryAircraft(): Promise<TrackedAircraft[]> {
  const now = new Date().toISOString();
  const aircraft: TrackedAircraft[] = [];
  const seen = new Set<string>();

  // Fetch globally-flagged military aircraft
  const res = await fetch(`${ADSB_LOL_API}/mil`, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ADSB.lol /v2/mil returned ${res.status}`);
  const data = await res.json();
  const ac = data?.ac || [];

  for (const a of ac) {
    const lat = a.lat as number | undefined;
    const lon = a.lon as number | undefined;
    const hex = (a.hex || "") as string;

    if (lat == null || lon == null || !hex) continue;
    if (seen.has(hex)) continue;

    // Filter to Middle East bounding box
    if (
      lat < TRACKING_BBOX.latMin ||
      lat > TRACKING_BBOX.latMax ||
      lon < TRACKING_BBOX.lngMin ||
      lon > TRACKING_BBOX.lngMax
    )
      continue;

    // Skip on-ground aircraft
    if (a.alt_baro === "ground" || a.ground === true) continue;

    // Skip stale positions
    const seenSec = typeof a.seen === "number" ? a.seen : 0;
    if (seenSec > AIRCRAFT_STALE_THRESHOLD_S) continue;

    // Double-check with our military filters (catches extras ADSB.lol might miss)
    const callsign = ((a.flight || "") as string).trim() || null;
    if (!isMilitary(hex, callsign)) continue;

    seen.add(hex);
    aircraft.push({
      hex,
      callsign: callsign || "UNKNOWN",
      lat,
      lng: lon,
      alt: typeof a.alt_baro === "number" ? a.alt_baro : 0,
      heading: typeof a.track === "number" ? a.track : 0,
      speed: typeof a.gs === "number" ? a.gs : 0,
      type: (a.t || "") as string,
      registration: (a.r || "") as string,
      onGround: false,
      seen: seenSec,
      lastSeen: now,
    });
  }

  return aircraft;
}

/** Get military aircraft (cache-first via Redis) */
export async function getMilitaryAircraft(): Promise<TrackedAircraft[]> {
  const redis = getRedis();

  // Try cache first
  if (redis) {
    const cached = await redis.get(REDIS_AIRCRAFT_KEY);
    if (cached) {
      return typeof cached === "string" ? JSON.parse(cached) : (cached as TrackedAircraft[]);
    }
  }

  // Cache miss — fetch fresh
  try {
    const aircraft = await fetchMilitaryAircraft();
    if (redis) {
      await redis.set(REDIS_AIRCRAFT_KEY, JSON.stringify(aircraft), {
        ex: AIRCRAFT_CACHE_TTL_S,
      });
    }
    return aircraft;
  } catch (err) {
    console.error("[Aircraft] Fetch failed:", err);
    return [];
  }
}

// ICAO hex prefix → country mapping (common military allocations)
const ICAO_COUNTRY_MAP: [number, number, string][] = [
  [0xA00000, 0xAFFFFF, "United States"],
  [0x700000, 0x70FFFF, "Afghanistan"],
  [0x710000, 0x71FFFF, "Philippines"],
  [0x730000, 0x737FFF, "Iran"],
  [0x738000, 0x73FFFF, "Israel"],
  [0x740000, 0x740FFF, "Jordan"],
  [0x748000, 0x74FFFF, "Kuwait"],
  [0x750000, 0x757FFF, "Saudi Arabia"],
  [0x760000, 0x767FFF, "Qatar"],
  [0x768000, 0x76FFFF, "UAE"],
  [0x780000, 0x78FFFF, "Turkey"],
  [0x3C0000, 0x3FFFFF, "Germany"],
  [0x400000, 0x43FFFF, "United Kingdom"],
  [0x380000, 0x3BFFFF, "France"],
  [0x440000, 0x447FFF, "Austria"],
  [0x480000, 0x4FFFFF, "Belgium/Netherlands"],
  [0x500000, 0x57FFFF, "Italy"],
  [0x800000, 0x87FFFF, "India"],
  [0x880000, 0x88FFFF, "Pakistan"],
  [0xE00000, 0xEFFFFF, "Russia"],
  [0xC00000, 0xC3FFFF, "Canada"],
  [0x7C0000, 0x7FFFFF, "Australia"],
];

function icaoToCountry(hex: string): string {
  const val = parseInt(hex, 16);
  if (isNaN(val)) return "Unknown";
  for (const [start, end, country] of ICAO_COUNTRY_MAP) {
    if (val >= start && val <= end) return country;
  }
  return "Unknown";
}

/** Convert aircraft array to GeoJSON for Mapbox */
export function aircraftToGeoJSON(
  aircraft: TrackedAircraft[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: aircraft.map((ac) => ({
      type: "Feature" as const,
      properties: {
        hex: ac.hex,
        callsign: ac.callsign,
        alt: ac.alt,
        heading: ac.heading,
        speed: ac.speed,
        type: ac.type,
        registration: ac.registration,
        country: icaoToCountry(ac.hex),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [ac.lng, ac.lat],
      },
    })),
  };
}
