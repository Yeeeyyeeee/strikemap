/**
 * Centralized constants for magic numbers and thresholds.
 */

// --- Polling intervals (client-side) ---
export const INCIDENT_POLL_MS = 45_000;
export const ALERT_POLL_MS = 15_000;
export const NOTAM_POLL_MS = 5 * 60 * 1000;

// --- Visual effects ---
export const STRIKE_FLASH_DURATION_MS = 600;
export const RANGE_RING_AUTO_CLEAR_MS = 15_000;
export const MARKER_FADING_INTERVAL_MS = 60_000;

// --- Dedup / merge ---
export const DEDUP_RADIUS_KM = 8;
export const DEDUP_WINDOW_MS = 600_000; // 10 minutes
export const TEXT_DEDUP_THRESHOLD = 0.4; // trigram similarity for unmapped incident dedup

// --- Dedup scoring weights ---
export const DEDUP_SCORE_THRESHOLD = 0.6;
export const DEDUP_SPATIAL_WEIGHT = 0.35;
export const DEDUP_TEMPORAL_WEIGHT = 0.25;
export const DEDUP_EVENT_TYPE_WEIGHT = 0.20;
export const DEDUP_TEXT_WEIGHT = 0.20;

// --- Geocode validation bounds (Middle East) ---
export const GEOCODE_LAT_MIN = 10;
export const GEOCODE_LAT_MAX = 45;
export const GEOCODE_LNG_MIN = 24;
export const GEOCODE_LNG_MAX = 65;

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
export const BROADCAST_SET_MAX_SIZE = 2000;
export const BROADCAST_STRIKE_DEDUP_KEY = "broadcast_strike_locations";
export const BROADCAST_STRIKE_DEDUP_RADIUS_KM = 10;
export const BROADCAST_STRIKE_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 min

// --- Chat ---
export const CHAT_MAX_MESSAGES = 200;
export const CHAT_MESSAGE_TTL_MS = 60 * 60 * 1000;
export const REDIS_CHAT_BANS_KEY = "chat_bans";
export const REDIS_CHAT_NICKNAMES_KEY = "chat_nicknames";
export const NICKNAME_RESERVE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const REDIS_CHAT_PINNED_KEY = "chat_pinned_v1";
export const REDIS_CHAT_LIKES_KEY = "chat_likes_v1";
export const CHAT_COOLDOWN_MS = 3_000; // 3s between messages
export const REDIS_CHAT_COOLDOWN_KEY = "chat_msg_cd";

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

// --- Ticker custom text ---
export const REDIS_TICKER_TEXT_KEY = "ticker_text";

// --- Feed history ---
export const REDIS_FEED_POSTS_KEY = "feed_posts_v1";
export const FEED_MAX_STORED_POSTS = 1000;

// --- Active users ---
export const REDIS_ACTIVE_USERS_KEY = "active_users";
export const ACTIVE_USER_TTL_S = 300; // 5 min heartbeat window

// --- Chat polls ---
export const REDIS_CHAT_POLL_VOTES_KEY = "chat_poll_voted_v1";

// --- Chat moderators ---
export const REDIS_MODERATORS_KEY = "chat_moderators";

// --- Suggestions ---
export const REDIS_SUGGESTIONS_KEY = "suggestions_v1";

// --- Changelog ---
export const REDIS_CHANGELOG_KEY = "changelog_v1";

// --- Alerts ---
export const CITIES_CACHE_TTL_MS = 60 * 60 * 1000;
export const ALERT_AGE_CUTOFF_MS = 15 * 60 * 1000;

// --- Interception outcomes ---
export const REDIS_INTERCEPTION_OUTCOMES_KEY = "interception_outcomes_v1";
export const REDIS_CLEARED_ALERTS_KEY = "cleared_alerts_v1";
export const INTERCEPTION_OUTCOME_TTL_S = 600;                    // 10 min
export const CLEARED_ALERT_TTL_S = 1800;                          // 30 min
export const IDF_CHECK_INTERVAL_MS = 15_000;                      // 15s throttle
export const INTERCEPTION_TIME_WINDOW_MS = 30 * 60 * 1000;        // 30 min match window
export const INTERCEPTION_BANNER_AUTO_DISMISS_MS = 120_000;       // 2 min client auto-dismiss

// --- Siren detection ---
export const SIREN_POLL_MS = 25_000;
export const SIREN_EXPIRY_MS = 10 * 60 * 1000;

// --- Satellite / FIRMS ---
export const REDIS_FIRMS_KEY = "firms_hotspots_v1";
export const REDIS_SENTINEL_KEY = "sentinel_imagery_v9";
export const REDIS_SENTINEL_TOKEN_KEY = "sentinel_oauth_token";
export const FIRMS_CACHE_TTL_S = 600; // 10 min
export const SENTINEL_IMAGERY_TTL_S = 3600; // 1 hour
export const SENTINEL_TOKEN_TTL_S = 540; // 9 min (tokens last 10 min)
export const SENTINEL_MAX_CLOUD_COVER = 40; // max cloud cover % for catalog search (relaxed — leastCC mosaicking picks clearest)
export const SENTINEL_CATALOG_LIMIT = 10; // how many candidate images to request
export const SENTINEL_CATALOG_TTL_S = 3600; // 1 hour catalog result cache
export const FIRMS_CONFIDENCE_THRESHOLD = 70;
export const FIRMS_CORRELATION_RADIUS_KM = 15;
export const FIRMS_POLL_MS = 5 * 60 * 1000; // 5 min client-side poll
export const FIRMS_BBOX = "24,12,65,42"; // Middle East bounding box: west,south,east,north
export const MAXAR_CACHE_TTL_S = 21600; // 6 hour Maxar coverage cache

// --- Seismic / Verification ---
export const REDIS_SEISMIC_KEY = "seismic_events_v1";
export const SEISMIC_CACHE_TTL_S = 600; // 10 min
export const SEISMIC_CORRELATION_RADIUS_KM = 50;
export const SEISMIC_CORRELATION_WINDOW_MS = 30 * 60 * 1000; // 30 min
export const SEISMIC_MIN_MAGNITUDE = 1.0;
export const SEISMIC_MAX_DEPTH_KM = 10; // explosions are shallow
export const SEISMIC_POLL_MS = 5 * 60 * 1000; // 5 min client poll
export const SEISMIC_BBOX = { minlat: 10, maxlat: 45, minlon: 24, maxlon: 65 };
export const FIRMS_CORRELATION_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h temporal check

// --- Wikipedia casualties ---
export const REDIS_WIKIPEDIA_CASUALTIES_KEY = "wikipedia_casualties_v1";
export const WIKIPEDIA_CASUALTIES_TTL_S = 1800; // 30 min

// --- Report / Briefing ---
export const REDIS_REPORT_KEY = "report_v1";
export const REPORT_CACHE_TTL_S = 21600; // 6 hours

// --- Airspace overrides ---
export const REDIS_AIRSPACE_OVERRIDES_KEY = "airspace_overrides_v1";

// --- Cyber status (IODA internet connectivity) ---
export const REDIS_CYBER_STATUS_KEY = "cyber_status_v1";

// --- Aircraft tracking ---
export const REDIS_AIRCRAFT_KEY = "mil_aircraft_v1";
export const AIRCRAFT_CACHE_TTL_S = 120;        // 2 min cache
export const AIRCRAFT_POLL_MS = 60_000;          // 1 min client poll
export const AIRCRAFT_STALE_THRESHOLD_S = 300;   // 5 min = stale, exclude

// --- Maritime vessel tracking ---
export const REDIS_VESSELS_KEY = "vessels_v1";
export const VESSELS_CACHE_TTL_S = 3600;         // 1h cache (vessels accumulate across cron runs)
export const VESSELS_POLL_MS = 2 * 60_000;       // 2 min client poll
export const VESSEL_WS_COLLECT_MS = 25_000;      // 25s WebSocket collection window (max ~25s for 30s serverless limit)
export const VESSEL_STALE_THRESHOLD_MS = 60 * 60_000; // 60 min retention — accumulate across many cron cycles

// Middle East bounding box for vessel/aircraft tracking
export const TRACKING_BBOX = {
  latMin: 10,
  latMax: 42,
  lngMin: 25,
  lngMax: 65,
};

// --- Alert country filter ---
export const ALERT_FILTER_COUNTRIES = [
  "Israel", "Iran", "Kuwait", "Jordan", "Cyprus", "Saudi Arabia",
  "Qatar", "Bahrain", "UAE", "Yemen", "Lebanon", "Syria", "Iraq",
  "Gaza", "Oman", "Turkey", "Pakistan",
];
