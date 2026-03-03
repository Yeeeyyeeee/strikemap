import { MissileAlert } from "./types";
import { getOriginForTarget } from "./israelGeocode";
import { getRedis } from "./redis";
import { REDIS_MANUAL_ALERTS_KEY } from "./constants";

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

// Alert stays "active" for its countdown + 2 min buffer after the alert time.
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

      // Determine threat type from description
      const desc = (item.description || "").toLowerCase();
      let threatType: "missile" | "drone" | "unknown" = "unknown";
      if (desc.includes("כלי טיס") || desc.includes("uav") || desc.includes("drone") || desc.includes("חדירת") || desc.includes("hostile aircraft") || desc.includes("כלי טיס עוין")) {
        threatType = "drone";
      } else if (desc.includes("רקט") || desc.includes("טיל") || desc.includes("missile") || desc.includes("rocket") || desc.includes("ירי")) {
        threatType = "missile";
      }

      for (const alert of item.alerts) {
        const alertTimeMs = alert.time * 1000;
        const ageMs = now - alertTimeMs;

        // Skip alerts older than 30 minutes
        if (ageMs > 30 * 60 * 1000) continue;

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

        const origin = getOriginForTarget(bestLat, bestLng, threatType, bestCountdown);
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
          threatType,
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

  return getActiveAlertsWithRedis();
}

function getActiveAlerts(): MissileAlert[] {
  return Array.from(activeAlerts.values())
    .map(({ createdAt: _, ...rest }) => rest);
}

/** Load manual alerts from Redis and merge with in-memory alerts. */
async function getActiveAlertsWithRedis(): Promise<MissileAlert[]> {
  const inMemory = getActiveAlerts();
  const r = getRedis();
  if (!r) return inMemory;

  try {
    const raw = await r.hgetall(REDIS_MANUAL_ALERTS_KEY);
    if (!raw || typeof raw !== "object") return inMemory;

    const now = Date.now();
    const redisAlerts: MissileAlert[] = [];
    for (const [id, value] of Object.entries(raw)) {
      const alert: MissileAlert & { createdAt?: number } =
        typeof value === "string" ? JSON.parse(value) : value as MissileAlert & { createdAt?: number };
      // Expire: countdown + 2min buffer
      const expiresAt = (alert.createdAt || now) + (alert.timeToImpact * 1000) + ALERT_BUFFER_MS;
      if (now > expiresAt) {
        r.hdel(REDIS_MANUAL_ALERTS_KEY, id).catch(() => {});
        continue;
      }
      const { createdAt: _, ...rest } = alert;
      redisAlerts.push(rest);
    }
    // Merge — Redis manual alerts + in-memory Tzofar alerts (dedup by id)
    const ids = new Set(inMemory.map((a) => a.id));
    for (const a of redisAlerts) {
      if (!ids.has(a.id)) inMemory.push(a);
    }
  } catch (err) {
    console.error("[tzevaadom] Failed to load manual alerts from Redis:", err);
  }
  return inMemory;
}

/** Insert a manually-created alert into Redis. */
export async function addManualAlert(alert: MissileAlert): Promise<void> {
  const entry = { ...alert, createdAt: Date.now() };
  // Also keep in memory for this instance
  activeAlerts.set(alert.id, entry);
  const r = getRedis();
  if (r) {
    await r.hset(REDIS_MANUAL_ALERTS_KEY, { [alert.id]: JSON.stringify(entry) });
  }
}

/** Remove a single alert by id from both memory and Redis. */
export async function clearAlert(id: string): Promise<boolean> {
  activeAlerts.delete(id);
  const r = getRedis();
  if (r) {
    await r.hdel(REDIS_MANUAL_ALERTS_KEY, id);
  }
  return true;
}

/** Clear all manual alerts from Redis. */
export async function clearAllManualAlerts(): Promise<void> {
  const r = getRedis();
  if (r) {
    await r.del(REDIS_MANUAL_ALERTS_KEY);
  }
  // Also clear from memory
  for (const id of activeAlerts.keys()) {
    if (id.startsWith("manual-")) activeAlerts.delete(id);
  }
}

/** Debug version that returns diagnostics */
export async function fetchTzevAdomAlertsDebug() {
  const now = Date.now();
  const diag: Record<string, unknown> = { timestamp: new Date().toISOString() };

  // 1. Test cities.json
  try {
    await loadCitiesData();
    diag.citiesLoaded = !!citiesCache;
    diag.citiesCount = citiesCache ? Object.keys(citiesCache).length : 0;
  } catch (err) {
    diag.citiesError = String(err);
  }

  // 2. Test Tzofar API
  try {
    const res = await fetch("https://api.tzevaadom.co.il/alerts-history/", {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    diag.tzofarStatus = res.status;
    diag.tzofarOk = res.ok;

    if (res.ok) {
      const history = await res.json();
      diag.historyCount = history.length;
      diag.recentAlerts = history.slice(0, 3).map((item: TzofarHistoryItem) => ({
        id: item.id,
        description: item.description,
        alertCount: item.alerts.length,
        alerts: item.alerts.map((a: TzofarAlertEntry) => ({
          time: a.time,
          ageMinutes: ((now - a.time * 1000) / 60000).toFixed(1),
          withinWindow: (now - a.time * 1000) < 5 * 60 * 1000,
          cities: a.cities,
          cityLookup: a.cities.map((c: string) => {
            const city = lookupCity(c);
            return city ? { name: city.en, lat: city.lat, lng: city.lng } : { name: c, found: false };
          }),
        })),
      }));
    }
  } catch (err) {
    diag.tzofarError = String(err);
  }

  // 3. Current state
  diag.activeAlertsCount = activeAlerts.size;
  diag.processedIdsCount = processedIds.size;

  // 4. Run normal fetch and return result
  const alerts = await fetchTzevAdomAlerts();
  diag.alerts = alerts;

  return diag;
}
