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
let cacheLoaded = false;

/** Load all incidents from Redis into memory (once per cold start) */
async function ensureLoaded(): Promise<Map<string, Incident>> {
  if (cacheLoaded) return memCache;
  cacheLoaded = true;

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
}

/** Save current in-memory state to Redis */
let saving = false;
async function persistToRedis(): Promise<void> {
  const r = getRedis();
  if (!r || saving) return;

  saving = true;
  try {
    const incidents = Array.from(memCache.values());
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

/**
 * Merge new incidents into the store.
 * Returns count of newly added incidents.
 */
export async function mergeIncidents(incidents: Incident[]): Promise<number> {
  const store = await ensureLoaded();
  let added = 0;

  for (const inc of incidents) {
    if (!store.has(inc.id)) {
      store.set(inc.id, inc);
      added++;
    }
  }

  if (added > 0) {
    console.log(`[store] Added ${added} new incidents (total: ${store.size})`);
    await persistToRedis();
  }

  return added;
}

/**
 * Seed the store with initial data if empty.
 */
export async function seedIfEmpty(incidents: Incident[]): Promise<void> {
  const store = await ensureLoaded();
  if (store.size === 0 && incidents.length > 0) {
    for (const inc of incidents) {
      store.set(inc.id, inc);
    }
    console.log(`[store] Seeded with ${store.size} incidents`);
    await persistToRedis();
  }
}

/**
 * Clear all data and force a fresh start.
 */
export async function clearStore(): Promise<void> {
  memCache = new Map();
  cacheLoaded = false;
  const r = getRedis();
  if (r) {
    await r.del(REDIS_KEY);
    await r.del("lastRefreshAt");
    console.log("[store] Cleared Redis store");
  }
}
