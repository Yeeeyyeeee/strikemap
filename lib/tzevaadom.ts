import { MissileAlert } from "./types";
import { getOriginForTarget } from "./israelGeocode";

// ---------------------------------------------------------------------------
// Types from Tzofar API
// ---------------------------------------------------------------------------

interface TzofarCity {
  id: number;
  he: string;
  en: string;
  ru: string;
  ar: string;
  es: string;
  area: number;
  countdown: number;
  lat: number;
  lng: number;
}

interface TzofarArea {
  he: string;
  en: string;
  ru: string;
  ar: string;
  es: string;
}

interface TzofarAlertEntry {
  time: number; // unix timestamp
  cities: string[]; // Hebrew city names
}

interface TzofarHistoryItem {
  id: number;
  description: string | null;
  alerts: TzofarAlertEntry[];
}

// ---------------------------------------------------------------------------
// Cache for cities data
// ---------------------------------------------------------------------------

let citiesCache: Record<string, TzofarCity> | null = null;
let areasCache: Record<string, TzofarArea> | null = null;
let lastCitiesFetch = 0;
const CITIES_CACHE_MS = 60 * 60 * 1000; // 1 hour

async function loadCitiesData() {
  const now = Date.now();
  if (citiesCache && areasCache && now - lastCitiesFetch < CITIES_CACHE_MS) return;

  try {
    const res = await fetch("https://www.tzevaadom.co.il/static/cities.json?v=9", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const data = await res.json();
    citiesCache = data.cities || {};
    areasCache = data.areas || {};
    lastCitiesFetch = now;
  } catch (err) {
    console.error("Failed to load Tzofar cities data:", err);
  }
}

function lookupCity(hebrewName: string): TzofarCity | null {
  if (!citiesCache) return null;
  return citiesCache[hebrewName] || null;
}

function getAreaName(areaId: number): string {
  if (!areasCache) return "";
  return areasCache[String(areaId)]?.en || "";
}

// ---------------------------------------------------------------------------
// Server-side state
// ---------------------------------------------------------------------------

const activeAlerts = new Map<string, MissileAlert & { createdAt: number }>();
const processedIds = new Set<number>();

// Alert is "active" only for its countdown + 2 min buffer after the alert time.
// This ensures alerts disappear once the threat window has passed.
const ALERT_BUFFER_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Main: fetch alerts from Tzofar API
// ---------------------------------------------------------------------------

export async function fetchTzevAdomAlerts(): Promise<MissileAlert[]> {
  const now = Date.now();

  await loadCitiesData();

  try {
    const res = await fetch("https://api.tzevaadom.co.il/alerts-history/", {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`Tzofar API error: ${res.status}`);
      return getActiveAlerts();
    }

    const history: TzofarHistoryItem[] = await res.json();

    for (const item of history) {
      if (processedIds.has(item.id)) continue;
      processedIds.add(item.id);

      for (const alert of item.alerts) {
        const alertTimeMs = alert.time * 1000;
        const ageMs = now - alertTimeMs;

        // Skip alerts that are clearly old (> 5 minutes — no active alert lasts that long)
        if (ageMs > 5 * 60 * 1000) continue;

        // Resolve cities to coordinates
        const regions = new Set<string>();
        const cityNames: string[] = [];
        let bestLat = 0;
        let bestLng = 0;
        let bestCountdown = 60;

        for (const hebrewCity of alert.cities) {
          const city = lookupCity(hebrewCity);
          if (city) {
            cityNames.push(city.en);
            if (city.area) regions.add(getAreaName(city.area));
            if (city.lat && city.lng && !bestLat) {
              bestLat = city.lat;
              bestLng = city.lng;
              bestCountdown = city.countdown || 60;
            }
          }
        }

        if (!bestLat || !bestLng) continue;

        const origin = getOriginForTarget(bestLat, bestLng);
        const alertId = `tzofar-${item.id}-${alert.time}`;

        // Format time
        const d = new Date(alertTimeMs);
        const timestamp = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;

        const regionArr = Array.from(regions).filter(Boolean);

        activeAlerts.set(alertId, {
          id: alertId,
          postId: String(item.id),
          timestamp,
          regions: regionArr,
          cities: cityNames,
          lat: bestLat,
          lng: bestLng,
          originLat: origin.lat,
          originLng: origin.lng,
          timeToImpact: bestCountdown,
          status: "active",
          rawText: `Red Alert: ${regionArr.join(", ")} — ${cityNames.slice(0, 10).join(", ")}`,
          createdAt: alertTimeMs,
        });
      }
    }
  } catch (err) {
    console.error("Failed to fetch Tzofar alerts:", err);
  }

  // Expire alerts once their countdown + buffer has passed
  for (const [id, alert] of activeAlerts) {
    const expiresAt = alert.createdAt + (alert.timeToImpact * 1000) + ALERT_BUFFER_MS;
    if (now > expiresAt) {
      activeAlerts.delete(id);
    }
  }

  return getActiveAlerts();
}

function getActiveAlerts(): MissileAlert[] {
  return Array.from(activeAlerts.values())
    .map(({ createdAt: _, ...rest }) => rest);
}
