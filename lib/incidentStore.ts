/**
 * Persistent incident store backed by Upstash Redis Hash.
 * Each incident is stored as its own field in a Redis hash,
 * written in small batches to stay within Upstash request limits.
 */

import { Incident } from "./types";
import { Redis } from "@upstash/redis";

const REDIS_KEY = "incidents_v3";
const BATCH_SIZE = 50; // Max fields per HSET call

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    return redis;
  }
  return null;
}

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
    description: inc.description?.slice(0, 150) || "",
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

/** Get current count */
export async function getIncidentCount(): Promise<number> {
  const store = await ensureLoaded();
  return store.size;
}

/** Haversine distance in km between two lat/lng points */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DEDUP_RADIUS_KM = 30;
const DEDUP_WINDOW_MS = 600_000;

/** Returns the matching existing incident if duplicate, or null */
function findDuplicate(inc: Incident, store: Map<string, Incident>): Incident | null {
  if (inc.lat === 0 && inc.lng === 0) return null;

  const incTime = inc.timestamp ? new Date(inc.timestamp).getTime() : 0;
  if (!incTime) return null;

  for (const existing of store.values()) {
    if (existing.lat === 0 && existing.lng === 0) continue;
    if (existing.side !== inc.side) continue;

    const existTime = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
    if (!existTime) continue;

    const timeDiff = Math.abs(incTime - existTime);
    if (timeDiff > DEDUP_WINDOW_MS) continue;

    const dist = distanceKm(inc.lat, inc.lng, existing.lat, existing.lng);
    if (dist < DEDUP_RADIUS_KM) return existing;
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
      // Update existing incident's casualties if the new report has data
      let updated = false;
      if (inc.casualties_military && inc.casualties_military > (existing.casualties_military || 0)) {
        existing.casualties_military = inc.casualties_military;
        updated = true;
      }
      if (inc.casualties_civilian && inc.casualties_civilian > (existing.casualties_civilian || 0)) {
        existing.casualties_civilian = inc.casualties_civilian;
        updated = true;
      }
      if (inc.casualties_description && !existing.casualties_description) {
        existing.casualties_description = inc.casualties_description;
        updated = true;
      }
      if (updated) {
        store.set(existing.id, existing);
        updatedIncidents.push(existing);
      }
      continue;
    }
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
 * Clear all data and force a fresh start.
 */
export async function clearStore(): Promise<void> {
  memCache = new Map();
  loadPromise = null;
  const r = getRedis();
  if (r) {
    await r.del(REDIS_KEY);
    await r.del("lastRefreshAt");
    console.log("[store] Cleared Redis store");
  }
}
