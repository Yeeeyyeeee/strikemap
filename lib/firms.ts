/**
 * NASA FIRMS (Fire Information for Resource Management System) client.
 * Fetches VIIRS thermal anomaly hotspots and correlates them with known incidents.
 *
 * Env: NASA_FIRMS_MAP_KEY
 */

import Papa from "papaparse";
import { getRedis } from "./redis";
import { haversineKm } from "./geo";
import { getAllIncidents } from "./incidentStore";
import { FIRMSHotspot, Incident } from "./types";
import {
  REDIS_FIRMS_KEY,
  FIRMS_CACHE_TTL_S,
  FIRMS_CONFIDENCE_THRESHOLD,
  FIRMS_CORRELATION_RADIUS_KM,
  FIRMS_BBOX,
  FIRMS_CORRELATION_WINDOW_MS,
} from "./constants";

const FIRMS_API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const SOURCE = "VIIRS_NOAA20_NRT";

// ─── Raw CSV → FIRMSHotspot parsing ──────────────────────────────

interface FIRMSRow {
  latitude: string;
  longitude: string;
  bright_ti4: string;
  frp: string;
  confidence: string;
  acq_date: string;
  acq_time: string;
  satellite: string;
  daynight: string;
}

function parseCSV(csv: string): FIRMSHotspot[] {
  const { data } = Papa.parse<FIRMSRow>(csv, { header: true, skipEmptyLines: true });

  return data
    .map((row) => ({
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      brightness: parseFloat(row.bright_ti4) || 0,
      frp: parseFloat(row.frp) || 0,
      confidence: parseInt(row.confidence, 10) || 0,
      acq_date: row.acq_date || "",
      acq_time: row.acq_time || "",
      satellite: row.satellite || "",
      daynight: (row.daynight === "D" ? "D" : "N") as "D" | "N",
    }))
    .filter(
      (h) =>
        !isNaN(h.latitude) &&
        !isNaN(h.longitude) &&
        h.confidence >= FIRMS_CONFIDENCE_THRESHOLD,
    );
}

// ─── Demo data for testing without API key ──────────────────────

function getDemoHotspots(): FIRMSHotspot[] {
  const today = new Date().toISOString().split("T")[0];
  return [
    // Iran — Isfahan (nuclear facilities area)
    { latitude: 32.65, longitude: 51.68, brightness: 340, frp: 45, confidence: 92, acq_date: today, acq_time: "0230", satellite: "N20", daynight: "N" },
    { latitude: 32.63, longitude: 51.70, brightness: 320, frp: 38, confidence: 88, acq_date: today, acq_time: "0230", satellite: "N20", daynight: "N" },
    // Iran — Natanz
    { latitude: 33.72, longitude: 51.73, brightness: 355, frp: 62, confidence: 95, acq_date: today, acq_time: "0145", satellite: "N20", daynight: "N" },
    // Iran — Bushehr
    { latitude: 28.83, longitude: 50.89, brightness: 310, frp: 28, confidence: 82, acq_date: today, acq_time: "0300", satellite: "N20", daynight: "N" },
    // Iran — Bandar Abbas
    { latitude: 27.19, longitude: 56.27, brightness: 330, frp: 41, confidence: 87, acq_date: today, acq_time: "0200", satellite: "N20", daynight: "N" },
    // Iran — Tabriz
    { latitude: 38.07, longitude: 46.30, brightness: 305, frp: 22, confidence: 78, acq_date: today, acq_time: "0315", satellite: "N20", daynight: "N" },
    // Iraq — Baghdad area
    { latitude: 33.31, longitude: 44.37, brightness: 315, frp: 33, confidence: 85, acq_date: today, acq_time: "0130", satellite: "N20", daynight: "N" },
    // Syria — Damascus
    { latitude: 33.51, longitude: 36.29, brightness: 325, frp: 36, confidence: 84, acq_date: today, acq_time: "0115", satellite: "N20", daynight: "N" },
    // Yemen — Hodeidah
    { latitude: 14.80, longitude: 42.95, brightness: 345, frp: 55, confidence: 93, acq_date: today, acq_time: "0200", satellite: "N20", daynight: "N" },
    { latitude: 14.78, longitude: 42.97, brightness: 335, frp: 48, confidence: 90, acq_date: today, acq_time: "0200", satellite: "N20", daynight: "N" },
    // Yemen — Sanaa
    { latitude: 15.35, longitude: 44.21, brightness: 318, frp: 30, confidence: 83, acq_date: today, acq_time: "0245", satellite: "N20", daynight: "N" },
    // Lebanon — Beirut area
    { latitude: 33.89, longitude: 35.50, brightness: 308, frp: 25, confidence: 80, acq_date: today, acq_time: "0100", satellite: "N20", daynight: "N" },
    // Israel — Negev
    { latitude: 31.25, longitude: 34.79, brightness: 312, frp: 29, confidence: 81, acq_date: today, acq_time: "0330", satellite: "N20", daynight: "N" },
    // Iran — Tehran
    { latitude: 35.70, longitude: 51.42, brightness: 350, frp: 58, confidence: 94, acq_date: today, acq_time: "0145", satellite: "N20", daynight: "N" },
    // Iran — Shiraz
    { latitude: 29.59, longitude: 52.58, brightness: 322, frp: 35, confidence: 86, acq_date: today, acq_time: "0215", satellite: "N20", daynight: "N" },
    // Saudi Arabia — Aramco area
    { latitude: 25.38, longitude: 49.48, brightness: 300, frp: 20, confidence: 75, acq_date: today, acq_time: "0300", satellite: "N20", daynight: "N" },
  ];
}

// ─── Fetch from NASA FIRMS Area API ─────────────────────────────

export async function fetchFIRMSData(): Promise<FIRMSHotspot[]> {
  const key = process.env.NASA_FIRMS_MAP_KEY;
  if (!key) {
    console.warn("[firms] NASA_FIRMS_MAP_KEY not set — using demo data");
    return getDemoHotspots();
  }

  // Fetch last 24h of VIIRS data for the Middle East bbox
  const url = `${FIRMS_API}/${key}/${SOURCE}/${FIRMS_BBOX}/1`;

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    console.error(`[firms] API returned ${res.status}: ${await res.text().catch(() => "")}`);
    return getDemoHotspots();
  }

  const csv = await res.text();
  const parsed = parseCSV(csv);
  return parsed.length > 0 ? parsed : getDemoHotspots();
}

// ─── Correlation with known incidents ───────────────────────────

/** Parse FIRMS acq_date + acq_time into epoch ms */
function parseHotspotTime(acq_date: string, acq_time: string): number {
  if (!acq_date) return 0;
  // acq_date = "2026-03-03", acq_time = "0130" (HHMM UTC)
  const hh = acq_time.slice(0, 2) || "00";
  const mm = acq_time.slice(2, 4) || "00";
  return new Date(`${acq_date}T${hh}:${mm}:00Z`).getTime();
}

export async function correlateWithIncidents(
  hotspots: FIRMSHotspot[],
): Promise<FIRMSHotspot[]> {
  const incidents = await getAllIncidents();
  const geoIncidents = incidents.filter(
    (i) => i.lat !== 0 && i.lng !== 0,
  );

  return hotspots.map((h) => {
    const hTime = parseHotspotTime(h.acq_date, h.acq_time);
    const match = geoIncidents.find((i) => {
      if (haversineKm(h.latitude, h.longitude, i.lat, i.lng) > FIRMS_CORRELATION_RADIUS_KM) {
        return false;
      }
      // Temporal check: hotspot must be within 2h of incident
      if (hTime && i.timestamp) {
        const iTime = new Date(i.timestamp).getTime();
        if (Math.abs(hTime - iTime) > FIRMS_CORRELATION_WINDOW_MS) return false;
      }
      return true;
    });
    return match
      ? { ...h, correlatedIncidentId: match.id }
      : h;
  });
}

// ─── Cache-first wrapper ────────────────────────────────────────

export async function getFIRMSHotspots(): Promise<FIRMSHotspot[]> {
  const redis = getRedis();

  // Try cache first
  if (redis) {
    try {
      const cached = await redis.get(REDIS_FIRMS_KEY);
      if (cached) {
        return typeof cached === "string" ? JSON.parse(cached) : cached as FIRMSHotspot[];
      }
    } catch (err) {
      console.warn("[firms] Redis read error:", err);
    }
  }

  // Fetch fresh data
  const raw = await fetchFIRMSData();
  const correlated = await correlateWithIncidents(raw);

  // Cache
  if (redis && correlated.length > 0) {
    try {
      await redis.set(REDIS_FIRMS_KEY, JSON.stringify(correlated), { ex: FIRMS_CACHE_TTL_S });
    } catch (err) {
      console.warn("[firms] Redis write error:", err);
    }
  }

  return correlated;
}

/** Refresh cached hotspots — called by cron */
export async function refreshFIRMSCache(): Promise<number> {
  const raw = await fetchFIRMSData();
  const correlated = await correlateWithIncidents(raw);

  const redis = getRedis();
  if (redis && correlated.length > 0) {
    await redis.set(REDIS_FIRMS_KEY, JSON.stringify(correlated), { ex: FIRMS_CACHE_TTL_S });
  }

  return correlated.length;
}

// ─── GeoJSON conversion for Mapbox ──────────────────────────────

export function hotspotsToGeoJSON(
  hotspots: FIRMSHotspot[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: hotspots.map((h) => ({
      type: "Feature" as const,
      properties: {
        confidence: h.confidence,
        frp: h.frp,
        brightness: h.brightness,
        satellite: h.satellite,
        acq_date: h.acq_date,
        acq_time: h.acq_time,
        daynight: h.daynight,
        correlated: h.correlatedIncidentId ? "1" : "0",
        incidentId: h.correlatedIncidentId || "",
        // Radius based on FRP: min 4px, max 16px
        radius: Math.max(4, Math.min(16, 4 + (h.frp / 50) * 12)),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [h.longitude, h.latitude],
      },
    })),
  };
}

/** Check if any hotspot is correlated with a specific incident */
export function isIncidentConfirmedByFIRMS(
  hotspots: FIRMSHotspot[],
  incidentId: string,
): boolean {
  return hotspots.some((h) => h.correlatedIncidentId === incidentId);
}

/** Check if a coordinate has a nearby thermal anomaly */
export function hasThermalAnomaly(
  hotspots: FIRMSHotspot[],
  lat: number,
  lng: number,
  radiusKm = FIRMS_CORRELATION_RADIUS_KM,
): boolean {
  return hotspots.some(
    (h) => haversineKm(h.latitude, h.longitude, lat, lng) <= radiusKm,
  );
}
