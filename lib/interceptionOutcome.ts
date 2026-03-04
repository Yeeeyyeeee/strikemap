/**
 * Interception Outcome Detection
 *
 * Monitors the IDF Spokesperson Telegram channel (@IDFofficial) for
 * interception reports after missile alerts clear. Stores outcomes in Redis.
 */

import { getRedis } from "./redis";
import { scrapeChannel } from "./telegram";
import { detectInterception } from "./keywordEnricher";
import { MissileAlert, InterceptionOutcome } from "./types";
import {
  REDIS_INTERCEPTION_OUTCOMES_KEY,
  REDIS_CLEARED_ALERTS_KEY,
  CLEARED_ALERT_TTL_S,
  INTERCEPTION_OUTCOME_TTL_S,
  IDF_CHECK_INTERVAL_MS,
  INTERCEPTION_TIME_WINDOW_MS,
} from "./constants";

const IDF_CHANNEL = "IDFofficial";

// In-memory throttle
let lastIdfCheckTime = 0;

// Track processed IDF posts to prevent duplicate outcomes
const processedIdfPostIds = new Set<string>();

interface ClearedAlertMeta {
  alertId: string;
  clearedAt: number;
  regions: string[];
  cities: string[];
  threatType?: string;
  threatClass?: string;
  originName?: string;
  rawText: string;
}

/**
 * Save metadata for cleared alerts so we can match them to IDF reports later.
 */
export async function saveClearedAlertMeta(alerts: MissileAlert[]): Promise<void> {
  const r = getRedis();
  if (!r || alerts.length === 0) return;

  const now = Date.now();
  const entries: Record<string, string> = {};

  for (const alert of alerts) {
    const meta: ClearedAlertMeta = {
      alertId: alert.id,
      clearedAt: now,
      regions: alert.regions,
      cities: alert.cities,
      threatType: alert.threatType,
      threatClass: alert.threatClass,
      originName: alert.originName,
      rawText: alert.rawText,
    };
    entries[alert.id] = JSON.stringify(meta);
  }

  await r.hset(REDIS_CLEARED_ALERTS_KEY, entries);
  await r.expire(REDIS_CLEARED_ALERTS_KEY, CLEARED_ALERT_TTL_S);
}

/**
 * Check the IDF Telegram channel for interception reports.
 * Matches them to recently cleared alerts by time proximity.
 * Throttled to run at most every IDF_CHECK_INTERVAL_MS.
 */
export async function checkForInterceptionOutcomes(): Promise<void> {
  const now = Date.now();
  if (now - lastIdfCheckTime < IDF_CHECK_INTERVAL_MS) return;
  lastIdfCheckTime = now;

  const r = getRedis();
  if (!r) return;

  // 1. Load cleared alerts from Redis
  const clearedRaw = await r.hgetall(REDIS_CLEARED_ALERTS_KEY);
  if (!clearedRaw || typeof clearedRaw !== "object" || Object.keys(clearedRaw).length === 0) return;

  const clearedAlerts: ClearedAlertMeta[] = [];
  for (const [, value] of Object.entries(clearedRaw)) {
    const meta: ClearedAlertMeta =
      typeof value === "string" ? JSON.parse(value) : (value as ClearedAlertMeta);
    if (now - meta.clearedAt < INTERCEPTION_TIME_WINDOW_MS) {
      clearedAlerts.push(meta);
    }
  }

  if (clearedAlerts.length === 0) return;

  // 2. Check which alerts already have outcomes
  const existingOutcomes = await r.hgetall(REDIS_INTERCEPTION_OUTCOMES_KEY);
  const coveredAlertIds = new Set<string>();
  if (existingOutcomes && typeof existingOutcomes === "object") {
    for (const [, value] of Object.entries(existingOutcomes)) {
      const outcome: InterceptionOutcome =
        typeof value === "string" ? JSON.parse(value) : (value as InterceptionOutcome);
      for (const aid of outcome.alertIds) coveredAlertIds.add(aid);
    }
  }

  const pendingAlerts = clearedAlerts.filter((a) => !coveredAlertIds.has(a.alertId));
  if (pendingAlerts.length === 0) return;

  // 3. Scrape IDF Telegram channel
  try {
    const posts = await scrapeChannel(IDF_CHANNEL);

    for (const post of posts) {
      if (processedIdfPostIds.has(post.id)) continue;

      const postTime = new Date(post.timestamp).getTime();
      if (isNaN(postTime)) continue;
      if (now - postTime > INTERCEPTION_TIME_WINDOW_MS) continue;

      // 4. Run interception detection
      const result = detectInterception(post.text);
      if (!result.intercepted_by && result.intercept_success === null) continue;

      // 5. Match to cleared alerts by time proximity
      const matchedAlertIds: string[] = [];
      let bestClearedAt = 0;

      for (const alert of pendingAlerts) {
        // IDF posts come after the alert clears — allow -5min to +30min window
        const timeDiff = postTime - alert.clearedAt;
        if (timeDiff > -5 * 60 * 1000 && timeDiff < INTERCEPTION_TIME_WINDOW_MS) {
          matchedAlertIds.push(alert.alertId);
          bestClearedAt = Math.max(bestClearedAt, alert.clearedAt);
        }
      }

      if (matchedAlertIds.length === 0) continue;

      processedIdfPostIds.add(post.id);

      // 6. Build outcome
      const summary = buildOutcomeSummary(result, pendingAlerts);
      const outcomeId = `outcome-${postTime}`;

      const outcome: InterceptionOutcome = {
        id: outcomeId,
        alertIds: matchedAlertIds,
        intercepted: result.intercept_success,
        interceptedBy: result.intercepted_by,
        missilesFired: result.missiles_fired,
        missilesIntercepted: result.missiles_intercepted,
        summary,
        sourcePostId: post.id,
        detectedAt: now,
        alertClearedAt: bestClearedAt,
      };

      await r.hset(REDIS_INTERCEPTION_OUTCOMES_KEY, { [outcomeId]: JSON.stringify(outcome) });
      await r.expire(REDIS_INTERCEPTION_OUTCOMES_KEY, INTERCEPTION_OUTCOME_TTL_S);

      // Remove matched alerts from pending
      for (const aid of matchedAlertIds) {
        const idx = pendingAlerts.findIndex((a) => a.alertId === aid);
        if (idx >= 0) pendingAlerts.splice(idx, 1);
      }

      console.log(`[interception] Detected outcome: ${summary}`);
    }
  } catch (err) {
    console.error("[interception] Failed to check IDF channel:", err);
  }

  // Trim processed set
  if (processedIdfPostIds.size > 500) {
    const arr = Array.from(processedIdfPostIds);
    processedIdfPostIds.clear();
    for (const id of arr.slice(-200)) processedIdfPostIds.add(id);
  }
}

/**
 * Load active interception outcomes from Redis.
 */
export async function getInterceptionOutcomes(): Promise<InterceptionOutcome[]> {
  const r = getRedis();
  if (!r) return [];

  try {
    const raw = await r.hgetall(REDIS_INTERCEPTION_OUTCOMES_KEY);
    if (!raw || typeof raw !== "object") return [];

    const outcomes: InterceptionOutcome[] = [];
    const now = Date.now();

    for (const [, value] of Object.entries(raw)) {
      const outcome: InterceptionOutcome =
        typeof value === "string" ? JSON.parse(value) : (value as InterceptionOutcome);
      if (now - outcome.detectedAt < INTERCEPTION_OUTCOME_TTL_S * 1000) {
        outcomes.push(outcome);
      }
    }

    return outcomes;
  } catch (err) {
    console.error("[interception] Failed to load outcomes:", err);
    return [];
  }
}

function buildOutcomeSummary(
  result: ReturnType<typeof detectInterception>,
  clearedAlerts: ClearedAlertMeta[]
): string {
  const origins = [...new Set(clearedAlerts.map((a) => a.originName).filter(Boolean))];
  const originText = origins.length > 0 ? origins.join("/") : "Iran";

  // Determine threat noun from alert metadata
  const hasDrone = clearedAlerts.some((a) => a.threatType === "drone");
  const threatNoun = hasDrone ? "drones" : "missiles";

  if (result.intercept_success === true) {
    let msg = `The previous launch of ${threatNoun} from ${originText} was successfully intercepted`;
    if (result.intercepted_by) msg += ` by ${result.intercepted_by}`;
    if (result.missiles_intercepted != null && result.missiles_fired != null) {
      msg += ` (${result.missiles_intercepted}/${result.missiles_fired})`;
    }
    return msg;
  }

  if (result.intercept_success === false) {
    return `The previous launch of ${threatNoun} from ${originText} has hit its target`;
  }

  // Unknown / partial
  let msg = "Interception report received";
  if (result.intercepted_by) msg += ` — ${result.intercepted_by} engaged`;
  if (result.missiles_fired != null) msg += ` (${result.missiles_fired} ${threatNoun} detected)`;
  return msg;
}
