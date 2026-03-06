/**
 * Persistent incident store backed by Upstash Redis Hash.
 * Each incident is stored as its own field in a Redis hash,
 * written in small batches to stay within Upstash request limits.
 */

import { Incident } from "./types";
import { getRedis } from "./redis";
import { haversineKm } from "./geo";
import {
  REDIS_INCIDENTS_KEY, REDIS_BATCH_SIZE, REDIS_REFRESH_KEY,
  DEDUP_RADIUS_KM, DEDUP_WINDOW_MS, TEXT_DEDUP_THRESHOLD,
  DEDUP_SCORE_THRESHOLD, DEDUP_SPATIAL_WEIGHT, DEDUP_TEMPORAL_WEIGHT,
  DEDUP_EVENT_TYPE_WEIGHT, DEDUP_TEXT_WEIGHT,
} from "./constants";
import { trigramSimilarity } from "./textDedup";

const REDIS_KEY = REDIS_INCIDENTS_KEY;
const BATCH_SIZE = REDIS_BATCH_SIZE;

// In-memory cache
let memCache: Map<string, Incident> = new Map();
let loadPromise: Promise<Map<string, Incident>> | null = null;

/** Load all incidents from Redis hash into memory (once per cold start) */
async function ensureLoaded(): Promise<Map<string, Incident>> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const r = getRedis();
    if (!r) {
      console.warn("[store] No Redis configured, using in-memory only");
      return memCache;
    }

    try {
      const raw = await r.hgetall(REDIS_KEY);
      if (!raw || typeof raw !== "object") {
        // Check if key exists at all
        const exists = await r.exists(REDIS_KEY);
        console.log(`[store] HGETALL returned empty (key exists: ${exists})`);
        return memCache;
      }

      let loaded = 0;
      for (const [id, value] of Object.entries(raw)) {
        try {
          const inc: Incident = typeof value === "string" ? JSON.parse(value) : value as Incident;
          if (inc && inc.id) {
            memCache.set(inc.id, inc);
            loaded++;
          }
        } catch {
          console.warn(`[store] Skipping corrupt entry: ${id}`);
        }
      }
      console.log(`[store] Loaded ${loaded} incidents from Redis hash`);
    } catch (err) {
      console.error("[store] Failed to load from Redis:", err);
    }

    return memCache;
  })();

  return loadPromise;
}

/** Strip verbose fields to keep each Redis hash entry small */
function slimIncident(inc: Incident): Partial<Incident> {
  return {
    id: inc.id,
    date: inc.date,
    timestamp: inc.timestamp,
    location: inc.location,
    lat: inc.lat,
    lng: inc.lng,
    description: inc.description?.slice(0, 300) || "",
    details: "",
    weapon: inc.weapon,
    target_type: inc.target_type,
    video_url: inc.video_url,
    media: inc.media,
    source_url: inc.source_url,
    source: inc.source,
    side: inc.side,
    target_military: inc.target_military,
    telegram_post_id: inc.telegram_post_id,
    intercepted_by: inc.intercepted_by,
    intercept_success: inc.intercept_success,
    damage_severity: inc.damage_severity,
    casualties_military: inc.casualties_military,
    casualties_civilian: inc.casualties_civilian,
    confidence: inc.confidence,
    sourceCount: inc.sourceCount,
    firmsBacked: inc.firmsBacked,
    seismicBacked: inc.seismicBacked,
    verification: inc.verification,
  };
}

/** Write incidents to Redis hash in small batches */
async function writeToRedis(incidents: Incident[]): Promise<number> {
  const r = getRedis();
  if (!r || incidents.length === 0) return 0;

  let written = 0;

  for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
    const batch = incidents.slice(i, i + BATCH_SIZE);
    const fields: Record<string, string> = {};
    for (const inc of batch) {
      fields[inc.id] = JSON.stringify(slimIncident(inc));
    }

    try {
      await r.hset(REDIS_KEY, fields);
      written += batch.length;
    } catch (err) {
      console.error(`[store] HSET batch failed (${i}-${i + batch.length}):`, err);
    }
  }

  // Verify the write
  try {
    const hashLen = await r.hlen(REDIS_KEY);
    console.log(`[store] Wrote ${written}/${incidents.length} incidents. Redis hash now has ${hashLen} entries.`);
  } catch {
    // Non-critical, just log
  }

  return written;
}

/** Get all stored incidents */
export async function getAllIncidents(): Promise<Incident[]> {
  const store = await ensureLoaded();
  return Array.from(store.values());
}

/** Update a single incident in store + Redis */
export async function updateIncident(incident: Incident): Promise<void> {
  const store = await ensureLoaded();
  store.set(incident.id, incident);
  await writeToRedis([incident]);
}

/** Get current count */
export async function getIncidentCount(): Promise<number> {
  const store = await ensureLoaded();
  return store.size;
}


// --- Geographic containment for dedup ---
const GEOGRAPHIC_CONTAINMENT: Record<string, string[]> = {
  "central israel": ["tel aviv", "herzliya", "petah tikva", "rishon lezion", "gush dan"],
  "northern israel": ["haifa", "tiberias", "nazareth", "kiryat shmona", "nahariya", "galilee"],
  "southern israel": ["beer sheva", "ashkelon", "ashdod", "sderot", "negev", "dimona", "eilat"],
  "gaza": ["gaza city", "rafah", "khan younis", "jabalia", "nuseirat", "deir al-balah"],
  "northern gaza": ["jabalia", "gaza city"],
  "southern gaza": ["rafah", "khan younis"],
  "lebanon": ["beirut", "dahieh", "tyre", "sidon", "nabatieh", "baalbek", "tripoli, lebanon", "bekaa"],
  "south lebanon": ["tyre", "nabatieh"],
  "iran": ["tehran", "isfahan", "tabriz", "shiraz", "bushehr", "bandar abbas", "ahvaz", "mashhad", "qom", "arak", "karaj"],
  "western iran": ["kermanshah", "khorramabad", "hamadan", "sanandaj"],
  "syria": ["damascus", "aleppo", "homs", "latakia", "deir ez-zor"],
  "iraq": ["baghdad", "erbil", "ain al-asad"],
  "yemen": ["sanaa", "hodeidah", "aden", "marib"],
};

function hasGeographicContainment(locA: string, locB: string): boolean {
  const a = locA.toLowerCase();
  const b = locB.toLowerCase();
  for (const [region, cities] of Object.entries(GEOGRAPHIC_CONTAINMENT)) {
    const aIsRegion = a.includes(region);
    const bIsRegion = b.includes(region);
    const aIsCity = cities.some((c) => a.includes(c));
    const bIsCity = cities.some((c) => b.includes(c));
    if ((aIsRegion && bIsCity) || (bIsRegion && aIsCity)) return true;
  }
  return false;
}

/** Return the incident with the more specific location string */
function moreSpecificLocation(incA: Incident, incB: Incident): Incident {
  const aCommas = (incA.location.match(/,/g) || []).length;
  const bCommas = (incB.location.match(/,/g) || []).length;
  if (aCommas !== bCommas) return aCommas > bCommas ? incA : incB;
  return incA.location.length > incB.location.length ? incA : incB;
}

/** Weapon category for event-type matching */
function weaponCategory(weapon: string): string {
  const w = weapon.toLowerCase();
  if (w.includes("drone") || w.includes("shahed") || w.includes("uav") || w.includes("loitering")) return "drone";
  if (w.includes("ballistic") || w.includes("fateh") || w.includes("emad") || w.includes("ghadr") || w.includes("sejjil")) return "ballistic";
  if (w.includes("cruise") || w.includes("tomahawk") || w.includes("jassm") || w.includes("paveh")) return "cruise";
  if (w.includes("airstrike") || w.includes("air strike") || w.includes("jdam") || w.includes("gbu") || w.includes("spice")) return "airstrike";
  if (w.includes("rocket")) return "rocket";
  if (w.includes("interceptor") || w.includes("iron dome") || w.includes("arrow") || w.includes("david") || w.includes("thaad")) return "interceptor";
  if (w.includes("missile")) return "missile";
  return "unknown";
}

/** Multi-factor dedup score (0-1) between two incidents */
export function dedupScore(inc: Incident, existing: Incident): number {
  let score = 0;

  // --- Spatial component (0 to DEDUP_SPATIAL_WEIGHT) ---
  if ((inc.lat !== 0 || inc.lng !== 0) && (existing.lat !== 0 || existing.lng !== 0)) {
    const dist = haversineKm(inc.lat, inc.lng, existing.lat, existing.lng);
    if (dist < DEDUP_RADIUS_KM) {
      score += DEDUP_SPATIAL_WEIGHT * (1 - dist / DEDUP_RADIUS_KM);
    } else if (dist < 50 && hasGeographicContainment(inc.location, existing.location)) {
      // Geographic containment bonus up to 50km
      score += DEDUP_SPATIAL_WEIGHT * 0.8;
    }
  }

  // --- Temporal component (0 to DEDUP_TEMPORAL_WEIGHT) ---
  const incTime = inc.timestamp ? new Date(inc.timestamp).getTime() : 0;
  const existTime = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
  if (incTime && existTime) {
    const timeDiff = Math.abs(incTime - existTime);
    if (timeDiff <= DEDUP_WINDOW_MS) {
      score += DEDUP_TEMPORAL_WEIGHT * (1 - timeDiff / DEDUP_WINDOW_MS);
    }
  }

  // --- Event type component (0 to DEDUP_EVENT_TYPE_WEIGHT) ---
  if (inc.weapon && existing.weapon) {
    const catA = weaponCategory(inc.weapon);
    const catB = weaponCategory(existing.weapon);
    if (catA === catB) {
      score += DEDUP_EVENT_TYPE_WEIGHT;
    } else if (catA !== "unknown" && catB !== "unknown") {
      score += DEDUP_EVENT_TYPE_WEIGHT * 0.3; // partial for different known weapons
    }
  } else if (!inc.weapon && !existing.weapon) {
    score += DEDUP_EVENT_TYPE_WEIGHT * 0.5; // both unknown, moderate match
  }

  // --- Text similarity component (0 to DEDUP_TEXT_WEIGHT) ---
  const incText = `${inc.description} ${inc.details || ""}`;
  const existText = `${existing.description} ${existing.details || ""}`;
  if (incText.length > 20 && existText.length > 20) {
    const sim = trigramSimilarity(incText, existText);
    score += DEDUP_TEXT_WEIGHT * sim;
  }

  // --- Side mismatch penalty ---
  if (inc.side !== existing.side) {
    score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

/** Returns the matching existing incident if duplicate, or null */
function findDuplicate(inc: Incident, store: Map<string, Incident>): Incident | null {
  const incTime = inc.timestamp ? new Date(inc.timestamp).getTime() : 0;
  if (!incTime) return null;

  let bestMatch: Incident | null = null;
  let bestScore = 0;

  // Multi-factor scoring for mapped incidents
  if (inc.lat !== 0 || inc.lng !== 0) {
    for (const existing of store.values()) {
      if (existing.lat === 0 && existing.lng === 0) continue;

      const existTime = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
      if (!existTime || Math.abs(incTime - existTime) > DEDUP_WINDOW_MS) continue;

      // Quick distance pre-filter: skip if > 50km (max containment range)
      const dist = haversineKm(inc.lat, inc.lng, existing.lat, existing.lng);
      if (dist > 50) continue;

      const score = dedupScore(inc, existing);
      if (score >= DEDUP_SCORE_THRESHOLD && score > bestScore) {
        bestScore = score;
        bestMatch = existing;
      }
    }
    return bestMatch;
  }

  // Text-based dedup for unmapped incidents (lat=0, lng=0)
  const incText = `${inc.description} ${inc.details || ""}`;
  if (incText.length < 30) return null;

  for (const existing of store.values()) {
    const existTime = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
    if (!existTime || Math.abs(incTime - existTime) > DEDUP_WINDOW_MS) continue;

    const existText = `${existing.description} ${existing.details || ""}`;
    const sim = trigramSimilarity(incText, existText);
    if (sim > TEXT_DEDUP_THRESHOLD) return existing;
  }

  return null;
}

/**
 * Merge new incidents into the store.
 * Writes only NEW incidents to Redis in small batches.
 */
export async function mergeIncidents(incidents: Incident[]): Promise<number> {
  const store = await ensureLoaded();
  let deduped = 0;
  const newIncidents: Incident[] = [];
  const updatedIncidents: Incident[] = [];

  for (const inc of incidents) {
    if (store.has(inc.id)) continue;
    const existing = findDuplicate(inc, store);
    if (existing) {
      deduped++;
      let updated = false;

      // Confidence promotion: increment sourceCount, promote confidence level
      const prevCount = existing.sourceCount ?? 1;
      existing.sourceCount = prevCount + 1;
      const prevConf = existing.confidence ?? "unconfirmed";
      if (prevConf === "unconfirmed" && existing.sourceCount >= 2) {
        existing.confidence = "confirmed";
      } else if (prevConf === "confirmed" && existing.sourceCount >= 3) {
        existing.confidence = "verified";
      }
      updated = true;

      // Location specificity: adopt the more specific location
      if (inc.location && existing.location && inc.lat !== 0) {
        const moreSpecific = moreSpecificLocation(inc, existing);
        if (moreSpecific === inc) {
          existing.location = inc.location;
          existing.lat = inc.lat;
          existing.lng = inc.lng;
          updated = true;
        }
      }

      // Casualty direction: accept newer report's numbers (allows corrections)
      if (inc.casualties_military != null && inc.casualties_military > 0) {
        existing.casualties_military = inc.casualties_military;
        updated = true;
      }
      if (inc.casualties_civilian != null && inc.casualties_civilian > 0) {
        existing.casualties_civilian = inc.casualties_civilian;
        updated = true;
      }
      if (inc.casualties_description && !existing.casualties_description) {
        existing.casualties_description = inc.casualties_description;
        updated = true;
      }
      if (inc.weapon && !existing.weapon) {
        existing.weapon = inc.weapon;
        updated = true;
      }
      if (inc.damage_severity && !existing.damage_severity) {
        existing.damage_severity = inc.damage_severity;
        updated = true;
      }
      if (inc.intercepted_by && !existing.intercepted_by) {
        existing.intercepted_by = inc.intercepted_by;
        existing.intercept_success = inc.intercept_success;
        existing.missiles_fired = inc.missiles_fired ?? existing.missiles_fired;
        existing.missiles_intercepted = inc.missiles_intercepted ?? existing.missiles_intercepted;
        updated = true;
      }
      if (inc.media && inc.media.length > 0 && (!existing.media || existing.media.length === 0)) {
        existing.media = inc.media;
        updated = true;
      }
      if (updated) {
        store.set(existing.id, existing);
        updatedIncidents.push(existing);
      }
      continue;
    }

    // New incident: initialize confidence tracking
    inc.confidence = inc.confidence ?? "unconfirmed";
    inc.sourceCount = inc.sourceCount ?? 1;
    store.set(inc.id, inc);
    newIncidents.push(inc);
  }

  // Persist new and updated incidents
  const toPersist = [...newIncidents, ...updatedIncidents];
  if (toPersist.length > 0) {
    const written = await writeToRedis(toPersist);
    console.log(`[store] Added ${newIncidents.length} new, updated ${updatedIncidents.length} existing (${written} persisted), deduped ${deduped} (total: ${store.size})`);
  } else if (deduped > 0) {
    console.log(`[store] Deduped ${deduped} incidents, 0 new`);
  }

  return newIncidents.length;
}

/**
 * Seed the store with initial data if empty.
 * Persists to Redis so seed data survives cold starts.
 */
export async function seedIfEmpty(incidents: Incident[]): Promise<void> {
  const store = await ensureLoaded();
  if (store.size === 0 && incidents.length > 0) {
    for (const inc of incidents) {
      store.set(inc.id, inc);
    }
    const written = await writeToRedis(incidents);
    console.log(`[store] Seeded ${store.size} baseline incidents (${written} persisted to Redis)`);
  }
}

/**
 * Remove duplicate incidents already in the store.
 */
export async function deduplicateStore(): Promise<number> {
  const store = await ensureLoaded();
  const entries = Array.from(store.entries());
  const keep = new Map<string, Incident>();
  const removeIds: string[] = [];

  for (const [id, inc] of entries) {
    if (findDuplicate(inc, keep)) {
      store.delete(id);
      removeIds.push(id);
    } else {
      keep.set(id, inc);
    }
  }

  if (removeIds.length > 0) {
    const r = getRedis();
    if (r) {
      try {
        // Batch HDEL too
        for (let i = 0; i < removeIds.length; i += BATCH_SIZE) {
          const batch = removeIds.slice(i, i + BATCH_SIZE);
          await r.hdel(REDIS_KEY, ...batch);
        }
        console.log(`[store] Deduplicated: removed ${removeIds.length} duplicates (${store.size} remaining)`);
      } catch (err) {
        console.error("[store] Failed to remove duplicates from Redis:", err);
      }
    }
  }

  return removeIds.length;
}

/**
 * Re-attribute the `side` field of ALL stored incidents based on their location.
 * Fixes historical data that was enriched with the old keyword-only logic.
 */
export async function reAttributeSides(): Promise<number> {
  const store = await ensureLoaded();
  const updated: Incident[] = [];

  for (const [, inc] of store) {
    const loc = (inc.location || "").toLowerCase();
    if (!loc) continue;

    let newSide: "iran" | "us" | "israel" = inc.side as "iran" | "us" | "israel";

    if (loc.includes("iran")) {
      // Strikes IN Iran are by US or Israel
      newSide = loc.includes("nuclear") || loc.includes("natanz") || loc.includes("fordow") ? "israel" : "us";
    } else if (loc.includes("israel") || loc.includes("golan")) {
      newSide = "iran";
    } else if (loc.includes("lebanon") || loc.includes("syria") || loc.includes("gaza") || loc.includes("beirut") || loc.includes("damascus")) {
      newSide = "israel";
    } else if (loc.includes("yemen") || loc.includes("sanaa") || loc.includes("hodeidah") || loc.includes("houthi")) {
      newSide = "us";
    } else if (loc.includes("uae") || loc.includes("bahrain") || loc.includes("qatar") || loc.includes("kuwait") || loc.includes("saudi") || loc.includes("dubai") || loc.includes("abu dhabi") || loc.includes("doha") || loc.includes("manama")) {
      newSide = "iran";
    } else if (loc.includes("iraq")) {
      // Iraq strikes are usually Iran/proxies attacking US bases, or US retaliating
      // If it's a US base, Iran is the attacker; otherwise keep existing
      if (loc.includes("al-asad") || loc.includes("green zone") || loc.includes("erbil") || loc.includes("harir")) {
        newSide = "iran";
      }
    }

    if (newSide !== inc.side) {
      inc.side = newSide;
      store.set(inc.id, inc);
      updated.push(inc);
    }
  }

  if (updated.length > 0) {
    const written = await writeToRedis(updated);
    console.log(`[store] Re-attributed ${updated.length} incidents (${written} persisted)`);
  }

  return updated.length;
}

/**
 * Re-enrich all stored incidents with keyword enricher to backfill casualties.
 */
export async function reEnrichCasualties(): Promise<number> {
  // Dynamic import to avoid circular deps
  const { enrichWithKeywords } = await import("./keywordEnricher");
  const store = await ensureLoaded();
  const updated: Incident[] = [];

  for (const [, inc] of store) {
    // Only re-enrich incidents that have text to analyze
    const text = inc.details || inc.description || "";
    if (!text || text.length < 10) continue;
    // Skip if already has casualties
    if ((inc.casualties_military || 0) > 0 || (inc.casualties_civilian || 0) > 0) continue;

    const result = enrichWithKeywords(text);
    if (result && (result.casualties_military > 0 || result.casualties_civilian > 0)) {
      inc.casualties_military = result.casualties_military;
      inc.casualties_civilian = result.casualties_civilian;
      inc.casualties_description = result.casualties_description;
      store.set(inc.id, inc);
      updated.push(inc);
    }
  }

  if (updated.length > 0) {
    const written = await writeToRedis(updated);
    console.log(`[store] Re-enriched casualties for ${updated.length} incidents (${written} persisted)`);
  }

  return updated.length;
}

/**
 * Cleanup unmapped incidents:
 * 1. Remove non-Iran-related unmapped incidents
 * 2. Text-dedup remaining unmapped against all incidents (1h window)
 */
export async function cleanupUnmapped(): Promise<{ removedNonIran: number; removedDupes: number }> {
  const { isIranRelated } = await import("./telegram");
  const store = await ensureLoaded();
  const removeIds: string[] = [];

  // Step 1: Remove non-Iran-related unmapped incidents
  for (const [id, inc] of store) {
    if (inc.lat !== 0 || inc.lng !== 0) continue;
    const text = inc.details || inc.description || "";
    if (!isIranRelated(text)) {
      removeIds.push(id);
      store.delete(id);
    }
  }
  const removedNonIran = removeIds.length;
  console.log(`[cleanup] Removed ${removedNonIran} non-Iran unmapped incidents`);

  // Step 2: Text-dedup remaining unmapped against all incidents (wider 1h window)
  const CLEANUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  const unmapped = Array.from(store.entries()).filter(([, inc]) => inc.lat === 0 && inc.lng === 0);
  const dupeIds: string[] = [];

  for (const [id, inc] of unmapped) {
    const incTime = inc.timestamp ? new Date(inc.timestamp).getTime() : 0;
    if (!incTime) continue;

    const incText = `${inc.description} ${inc.details || ""}`;
    if (incText.length < 30) continue;

    for (const [existId, existing] of store) {
      if (existId === id) continue;
      if (dupeIds.includes(id)) break;

      const existTime = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
      if (!existTime || Math.abs(incTime - existTime) > CLEANUP_WINDOW_MS) continue;

      const existText = `${existing.description} ${existing.details || ""}`;
      const sim = trigramSimilarity(incText, existText);
      if (sim > TEXT_DEDUP_THRESHOLD) {
        dupeIds.push(id);
        store.delete(id);
        break;
      }
    }
  }
  console.log(`[cleanup] Removed ${dupeIds.length} text-duplicate unmapped incidents`);

  // Persist deletions to Redis
  const allRemoved = [...removeIds, ...dupeIds];
  if (allRemoved.length > 0) {
    const r = getRedis();
    if (r) {
      for (let i = 0; i < allRemoved.length; i += BATCH_SIZE) {
        const batch = allRemoved.slice(i, i + BATCH_SIZE);
        await r.hdel(REDIS_KEY, ...batch);
      }
    }
  }

  return { removedNonIran, removedDupes: dupeIds.length };
}

/**
 * Clear all data and force a fresh start.
 */
export async function clearStore(): Promise<void> {
  memCache = new Map();
  loadPromise = null;
  const r = getRedis();
  if (r) {
    await r.del(REDIS_KEY);
    await r.del(REDIS_REFRESH_KEY);
    console.log("[store] Cleared Redis store");
  }
}
