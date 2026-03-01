/**
 * Persistent incident store backed by Upstash Redis.
 * Falls back to in-memory store if Redis is not configured.
 * Data survives cold starts and deployments.
 */

import { Incident } from "./types";
import { Redis } from "@upstash/redis";

const REDIS_KEY = "incidents";

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

// In-memory cache to avoid hitting Redis on every request
let memCache: Map<string, Incident> = new Map();
let cacheLoaded = false;

/** Load all incidents from Redis into memory (once per cold start) */
async function ensureLoaded(): Promise<Map<string, Incident>> {
  if (cacheLoaded) return memCache;

  const r = getRedis();
  if (r) {
    try {
      const data = await r.get<Incident[]>(REDIS_KEY);
      if (data && Array.isArray(data)) {
        for (const inc of data) {
          memCache.set(inc.id, inc);
        }
        console.log(`[store] Loaded ${memCache.size} incidents from Redis`);
      }
    } catch (err) {
      console.error("[store] Failed to load from Redis:", err);
    }
  }

  cacheLoaded = true;
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
    await r.set(REDIS_KEY, JSON.stringify(incidents));
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
 * Only adds incidents with valid coordinates that aren't already stored.
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
