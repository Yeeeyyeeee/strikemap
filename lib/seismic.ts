/**
 * USGS Earthquake API client.
 * Fetches seismic events and correlates them with known incidents.
 * Shallow events (depth <= 10km) near conflict zones may indicate explosions.
 *
 * No API key required.
 */

import { getRedis } from "./redis";
import { haversineKm } from "./geo";
import { getAllIncidents } from "./incidentStore";
import { SeismicEvent, Incident } from "./types";
import {
  REDIS_SEISMIC_KEY,
  SEISMIC_CACHE_TTL_S,
  SEISMIC_CORRELATION_RADIUS_KM,
  SEISMIC_CORRELATION_WINDOW_MS,
  SEISMIC_MIN_MAGNITUDE,
  SEISMIC_MAX_DEPTH_KM,
  SEISMIC_BBOX,
} from "./constants";

const USGS_API = "https://earthquake.usgs.gov/fdsnws/event/1/query";

// --- Fetch from USGS FDSN API ---

export async function fetchSeismicData(): Promise<SeismicEvent[]> {
  const endtime = new Date().toISOString();
  const starttime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    format: "geojson",
    starttime,
    endtime,
    minmagnitude: String(SEISMIC_MIN_MAGNITUDE),
    minlatitude: String(SEISMIC_BBOX.minlat),
    maxlatitude: String(SEISMIC_BBOX.maxlat),
    minlongitude: String(SEISMIC_BBOX.minlon),
    maxlongitude: String(SEISMIC_BBOX.maxlon),
    orderby: "time",
  });

  try {
    const res = await fetch(`${USGS_API}?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`[seismic] USGS API returned ${res.status}`);
      return getDemoSeismicEvents();
    }

    const data = await res.json();
    if (!data.features || data.features.length === 0) {
      return getDemoSeismicEvents();
    }

    return data.features
      .map((f: { id: string; properties: { mag: number; place: string; time: number; type: string }; geometry: { coordinates: number[] } }) => ({
        id: f.id,
        magnitude: f.properties.mag,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        depth: f.geometry.coordinates[2],
        timestamp: new Date(f.properties.time).toISOString(),
        place: f.properties.place || "Unknown",
        type: f.properties.type || "earthquake",
      }))
      .filter((e: SeismicEvent) => e.depth <= SEISMIC_MAX_DEPTH_KM || e.type === "explosion");
  } catch (err) {
    console.error("[seismic] Fetch failed:", err);
    return getDemoSeismicEvents();
  }
}

// --- Demo data ---

function getDemoSeismicEvents(): SeismicEvent[] {
  const now = new Date().toISOString();
  return [
    { id: "demo-1", magnitude: 2.8, lat: 32.65, lng: 51.68, depth: 3, timestamp: now, place: "Central Iran", type: "earthquake" },
    { id: "demo-2", magnitude: 3.2, lat: 33.72, lng: 51.73, depth: 2, timestamp: now, place: "Near Natanz, Iran", type: "explosion" },
    { id: "demo-3", magnitude: 1.5, lat: 14.80, lng: 42.95, depth: 5, timestamp: now, place: "Western Yemen", type: "earthquake" },
    { id: "demo-4", magnitude: 2.1, lat: 33.31, lng: 44.37, depth: 4, timestamp: now, place: "Baghdad, Iraq", type: "earthquake" },
  ];
}

// --- Correlation with incidents ---

export async function correlateSeismicWithIncidents(
  events: SeismicEvent[],
): Promise<SeismicEvent[]> {
  const incidents = await getAllIncidents();
  const geoIncidents = incidents.filter((i) => i.lat !== 0 && i.lng !== 0);

  return events.map((e) => {
    const eTime = new Date(e.timestamp).getTime();
    const match = geoIncidents.find((i: Incident) => {
      const iTime = i.timestamp ? new Date(i.timestamp).getTime() : 0;
      if (!iTime) return false;
      const timeDelta = Math.abs(eTime - iTime);
      if (timeDelta > SEISMIC_CORRELATION_WINDOW_MS) return false;
      return haversineKm(e.lat, e.lng, i.lat, i.lng) <= SEISMIC_CORRELATION_RADIUS_KM;
    });
    return match ? { ...e, correlatedIncidentId: match.id } : e;
  });
}

// --- Cache-first wrapper ---

export async function getSeismicEvents(): Promise<SeismicEvent[]> {
  const redis = getRedis();

  if (redis) {
    try {
      const cached = await redis.get(REDIS_SEISMIC_KEY);
      if (cached) {
        return typeof cached === "string" ? JSON.parse(cached) : cached as SeismicEvent[];
      }
    } catch (err) {
      console.warn("[seismic] Redis read error:", err);
    }
  }

  const raw = await fetchSeismicData();
  const correlated = await correlateSeismicWithIncidents(raw);

  if (redis && correlated.length > 0) {
    try {
      await redis.set(REDIS_SEISMIC_KEY, JSON.stringify(correlated), { ex: SEISMIC_CACHE_TTL_S });
    } catch (err) {
      console.warn("[seismic] Redis write error:", err);
    }
  }

  return correlated;
}

/** Refresh cached seismic data -- called by cron */
export async function refreshSeismicCache(): Promise<number> {
  const raw = await fetchSeismicData();
  const correlated = await correlateSeismicWithIncidents(raw);

  const redis = getRedis();
  if (redis && correlated.length > 0) {
    await redis.set(REDIS_SEISMIC_KEY, JSON.stringify(correlated), { ex: SEISMIC_CACHE_TTL_S });
  }

  return correlated.length;
}

// --- GeoJSON conversion for Mapbox ---

export function seismicToGeoJSON(
  events: SeismicEvent[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: events.map((e) => ({
      type: "Feature" as const,
      properties: {
        id: e.id,
        magnitude: e.magnitude,
        depth: e.depth,
        place: e.place,
        type: e.type,
        timestamp: e.timestamp,
        correlated: e.correlatedIncidentId ? "1" : "0",
        incidentId: e.correlatedIncidentId || "",
        // Radius scaled by magnitude: min 4, max 18
        radius: Math.max(4, Math.min(18, 4 + (e.magnitude / 5) * 14)),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [e.lng, e.lat],
      },
    })),
  };
}
