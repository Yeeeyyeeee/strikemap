/**
 * Spatial/temporal dedup for broadcast strike alerts.
 * Prevents the same strike from being sent to Telegram multiple times
 * when reported by different source channels.
 *
 * Uses a Redis sorted set keyed by timestamp, with lat:lng as members.
 * Before broadcasting a strike, check if a nearby strike was already
 * broadcast within the dedup window.
 */

import { getRedis } from "./redis";
import {
  BROADCAST_STRIKE_DEDUP_KEY,
  BROADCAST_STRIKE_DEDUP_RADIUS_KM,
  BROADCAST_STRIKE_DEDUP_WINDOW_MS,
} from "./constants";

/** Haversine distance in km */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if a strike at this location was already broadcast recently.
 * Returns true if duplicate (should skip), false if new (should broadcast).
 */
export async function isStrikeBroadcastDuplicate(lat: number, lng: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false; // No Redis = can't dedup, allow it

  const now = Date.now();
  const cutoff = now - BROADCAST_STRIKE_DEDUP_WINDOW_MS;

  try {
    // Get all recent broadcast strike locations (score = timestamp)
    const entries = (await redis.zrange(BROADCAST_STRIKE_DEDUP_KEY, cutoff, "+inf", {
      byScore: true,
    })) as string[];

    if (!entries || entries.length === 0) return false;

    // Check if any recent broadcast is within the radius
    for (const entry of entries) {
      const [eLat, eLng] = entry.split(":").map(Number);
      if (isNaN(eLat) || isNaN(eLng)) continue;
      const dist = haversineKm(lat, lng, eLat, eLng);
      if (dist < BROADCAST_STRIKE_DEDUP_RADIUS_KM) {
        return true; // Duplicate — a nearby strike was already broadcast
      }
    }

    return false;
  } catch (err) {
    console.error("[broadcastDedup] Check failed:", err);
    return false; // On error, allow broadcast
  }
}

/**
 * Record that a strike at this location was broadcast.
 * Called after successfully sending a strike alert.
 */
export async function recordStrikeBroadcast(lat: number, lng: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const now = Date.now();
  const member = `${lat}:${lng}`;

  try {
    // Add with timestamp as score
    await redis.zadd(BROADCAST_STRIKE_DEDUP_KEY, { score: now, member });

    // Clean up entries older than the dedup window
    const cutoff = now - BROADCAST_STRIKE_DEDUP_WINDOW_MS;
    await redis.zremrangebyscore(BROADCAST_STRIKE_DEDUP_KEY, 0, cutoff);
  } catch (err) {
    console.error("[broadcastDedup] Record failed:", err);
  }
}
