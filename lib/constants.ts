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

// --- Announcement ---
export const REDIS_ANNOUNCEMENT_KEY = "announcement";

// --- Feed history ---
export const REDIS_FEED_POSTS_KEY = "feed_posts_v1";
export const FEED_MAX_STORED_POSTS = 1000;

// --- Active users ---
export const REDIS_ACTIVE_USERS_KEY = "active_users";
export const ACTIVE_USER_TTL_S = 300; // 5 min heartbeat window

// --- Suggestions ---
export const REDIS_SUGGESTIONS_KEY = "suggestions_v1";

// --- Alerts ---
export const CITIES_CACHE_TTL_MS = 60 * 60 * 1000;
export const ALERT_AGE_CUTOFF_MS = 15 * 60 * 1000;

// --- Siren detection ---
export const SIREN_POLL_MS = 15_000;
export const SIREN_EXPIRY_MS = 30 * 60 * 1000;

// --- Satellite / FIRMS ---
export const REDIS_FIRMS_KEY = "firms_hotspots_v1";
export const REDIS_SENTINEL_KEY = "sentinel_imagery_v6";
export const REDIS_SENTINEL_TOKEN_KEY = "sentinel_oauth_token";
export const FIRMS_CACHE_TTL_S = 600; // 10 min
export const SENTINEL_IMAGERY_TTL_S = 3600; // 1 hour
export const SENTINEL_TOKEN_TTL_S = 540; // 9 min (tokens last 10 min)
export const SENTINEL_MAX_CLOUD_COVER = 15; // max cloud cover % for catalog search
export const SENTINEL_CATALOG_LIMIT = 5; // how many candidate images to request
export const SENTINEL_CATALOG_TTL_S = 3600; // 1 hour catalog result cache
export const FIRMS_CONFIDENCE_THRESHOLD = 70;
export const FIRMS_CORRELATION_RADIUS_KM = 15;
export const FIRMS_POLL_MS = 5 * 60 * 1000; // 5 min client-side poll
export const FIRMS_BBOX = "24,12,65,42"; // Middle East bounding box: west,south,east,north
export const MAXAR_CACHE_TTL_S = 21600; // 6 hour Maxar coverage cache
