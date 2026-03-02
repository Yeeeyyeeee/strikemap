/**
 * Centralized constants for magic numbers and thresholds.
 */

// --- Polling intervals (client-side) ---
export const INCIDENT_POLL_MS = 30_000;
export const ALERT_POLL_MS = 15_000;
export const NOTAM_POLL_MS = 5 * 60 * 1000;

// --- Visual effects ---
export const STRIKE_FLASH_DURATION_MS = 600;
export const RANGE_RING_AUTO_CLEAR_MS = 15_000;
export const MARKER_FADING_INTERVAL_MS = 60_000;

// --- Dedup / merge ---
export const DEDUP_RADIUS_KM = 30;
export const DEDUP_WINDOW_MS = 600_000; // 10 minutes

// --- Refresh orchestration ---
export const REFRESH_INTERVAL_MS = 60_000;
export const SHEET_FETCH_TIMEOUT_MS = 10_000;
export const RSS_FETCH_TIMEOUT_MS = 15_000;
export const TELEGRAM_FETCH_TIMEOUT_MS = 45_000;

// --- Kill chain grouping ---
export const KILL_CHAIN_RADIUS_KM = 100;

// --- Heatmap ---
export const DEFAULT_HEATMAP_RADIUS_KM = 50;

// --- Broadcast ---
export const BROADCAST_MAX_PER_RUN = 5;
export const BROADCAST_SET_MAX_SIZE = 500;

// --- Chat ---
export const CHAT_MAX_MESSAGES = 200;
export const CHAT_MESSAGE_TTL_MS = 60 * 60 * 1000;

// --- Map zoom ---
export const ZOOM_DETAIL_THRESHOLD = 8;

// --- Redis keys ---
export const REDIS_INCIDENTS_KEY = "incidents_v3";
export const REDIS_REFRESH_KEY = "lastRefreshAt";
export const REDIS_BROADCAST_KEY = "broadcastSentIds";
export const REDIS_YOUTUBE_KEY = "youtube_links";
export const REDIS_CHAT_KEY = "chat_messages";

// --- Redis batch ---
export const REDIS_BATCH_SIZE = 50;

// --- Manual alerts Redis keys ---
export const REDIS_MANUAL_ALERTS_KEY = "manual_missile_alerts";
export const REDIS_MANUAL_SIRENS_KEY = "manual_sirens";

// --- Alerts ---
export const CITIES_CACHE_TTL_MS = 60 * 60 * 1000;
export const ALERT_AGE_CUTOFF_MS = 15 * 60 * 1000;

// --- Siren detection ---
export const SIREN_POLL_MS = 15_000;
export const SIREN_EXPIRY_MS = 30 * 60 * 1000;
