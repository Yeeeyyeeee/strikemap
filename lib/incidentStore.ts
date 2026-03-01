/**
 * Persistent incident store backed by Upstash Redis.
 * Falls back to in-memory store if Redis is not configured.
 */

import { Incident } from "./types";
import { Redis } from "@upstash/redis";

const REDIS_KEY = "incidents_v2"; // New key to avoid corrupted old data

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

/** Load all incidents from Redis into memory (once per cold start) */
async function ensureLoaded(): Promise<Map<string, Incident>> {
  // If already loaded, return immediately
  if (loadPromise) return loadPromise;

  // Create a single promise that all concurrent callers will await
  loadPromise = (async () => {
    const r = getRedis();
    if (!r) return memCache;

    try {
      const raw = await r.get(REDIS_KEY);
      if (!raw) return memCache;

      // Handle both correctly stored arrays and legacy string-encoded data
      let incidents: Incident[];
      if (Array.isArray(raw)) {
        incidents = raw;
      } else if (typeof raw === "string") {
        incidents = JSON.parse(raw);
      } else {
        return memCache;
      }

      if (Array.isArray(incidents)) {
        for (const inc of incidents) {
          if (inc && inc.id) memCache.set(inc.id, inc);
        }
        console.log(`[store] Loaded ${memCache.size} incidents from Redis`);
      }
    } catch (err) {
      console.error("[store] Failed to load from Redis:", err);
    }

    return memCache;
  })();

  return loadPromise;
}

/** Strip verbose fields to keep Redis payload under 1MB */
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
    video_url: "",
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

/** Save current in-memory state to Redis */
let saving = false;
async function persistToRedis(): Promise<void> {
  const r = getRedis();
  if (!r || saving) return;

  saving = true;
  try {
    const incidents = Array.from(memCache.values()).map(slimIncident);
    await r.set(REDIS_KEY, incidents);
    console.log(`[store] Persisted ${incidents.length} incidents to Redis`);
  } catch (err) {
    console.error("[store] Failed to save to Redis:", err);
  } finally {
    saving = false;
  }
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

const DEDUP_RADIUS_KM = 30;   // Same strike if within 30km
const DEDUP_WINDOW_MS = 600_000; // and within 10 minutes

/**
 * Check if an incident is a duplicate of an existing one.
 * Two reports are considered the same strike if they are:
 * - Within 30km of each other
 * - Within 10 minutes of each other
 * - On the same side
 */
function isDuplicate(inc: Incident, store: Map<string, Incident>): boolean {
  if (inc.lat === 0 && inc.lng === 0) return false; // Can't dedup without coords

  const incTime = inc.timestamp ? new Date(inc.timestamp).getTime() : 0;
  if (!incTime) return false;

  for (const existing of store.values()) {
    if (existing.lat === 0 && existing.lng === 0) continue;
    if (existing.side !== inc.side) continue;

    const existTime = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
    if (!existTime) continue;

    const timeDiff = Math.abs(incTime - existTime);
    if (timeDiff > DEDUP_WINDOW_MS) continue;

    const dist = distanceKm(inc.lat, inc.lng, existing.lat, existing.lng);
    if (dist < DEDUP_RADIUS_KM) return true;
  }

  return false;
}

/**
 * Merge new incidents into the store.
 * Deduplicates by geographic proximity + time window.
 * Returns count of newly added incidents.
 */
export async function mergeIncidents(incidents: Incident[]): Promise<number> {
  const store = await ensureLoaded();
  let added = 0;
  let deduped = 0;

  for (const inc of incidents) {
    if (store.has(inc.id)) continue; // Exact ID match
    if (isDuplicate(inc, store)) {
      deduped++;
      continue;
    }
    store.set(inc.id, inc);
    added++;
  }

  if (added > 0) {
    console.log(`[store] Added ${added} new incidents, deduped ${deduped} (total: ${store.size})`);
    await persistToRedis();
  } else if (deduped > 0) {
    console.log(`[store] Deduped ${deduped} incidents, 0 new`);
  }

  return added;
}

/**
 * Seed the store with initial data if empty.
 * NEVER persists seed data to Redis — seed is in-memory only as a baseline.
 * Real data from refreshLiveData() will merge on top and persist.
 */
export async function seedIfEmpty(incidents: Incident[]): Promise<void> {
  const store = await ensureLoaded();
  if (store.size === 0 && incidents.length > 0) {
    for (const inc of incidents) {
      store.set(inc.id, inc);
    }
    console.log(`[store] Seeded in-memory with ${store.size} baseline incidents (not persisted to Redis)`);
  }
}

/**
 * Remove duplicate incidents already in the store.
 * Keeps the first occurrence, removes later ones that match by proximity + time.
 */
export async function deduplicateStore(): Promise<number> {
  const store = await ensureLoaded();
  const entries = Array.from(store.entries());
  const keep = new Map<string, Incident>();
  let removed = 0;

  for (const [id, inc] of entries) {
    if (isDuplicate(inc, keep)) {
      store.delete(id);
      removed++;
    } else {
      keep.set(id, inc);
    }
  }

  if (removed > 0) {
    console.log(`[store] Deduplicated: removed ${removed} duplicates (${store.size} remaining)`);
    await persistToRedis();
  }

  return removed;
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
