/**
 * Detects siren/air-raid alerts from Telegram posts for NON-Israel countries.
 * Israel sirens are excluded — those are handled by lib/tzevaadom.ts (Tzeva Adom).
 */

import { getRedis } from "./redis";
import { REDIS_MANUAL_SIRENS_KEY } from "./constants";

export interface SirenAlert {
  id: string;
  country: string;
  activatedAt: number;
  lastSeenAt: number;
  sourceChannel: string;
  sourceText: string;
  status: "active" | "cleared";
}

// --- Siren activation keywords ---

const SIREN_ACTIVATE_KEYWORDS = [
  // Direct siren references
  "siren", "sirens", "air raid", "air-raid",
  "air raid siren", "air defense siren", "civil defense siren",
  "warning siren", "alarm sounding", "alarms sounding",
  "sirens sounding", "sirens activated", "sirens heard",
  "sirens blaring", "sirens wailing",
  // Shelter directives
  "take shelter", "seek shelter", "go to shelter", "bomb shelter",
  "shelter now", "shelter in place",
  // Alert terms
  "air alert", "air alarm",
  "under attack", "incoming missiles", "incoming rockets",
  "air defense activated", "warning systems activated",
  // Arabic
  "صافرات الإنذار", "إنذار", "صافرة", "صفارات", "احتموا",
  "تحت الهجوم", "صواريخ قادمة", "دفاع جوي",
  // Persian
  "آژیر", "آژیر خطر", "پناهگاه",
  // Turkish
  "siren sesleri",
];

// --- Siren clear keywords ---

const SIREN_CLEAR_KEYWORDS = [
  "sirens stopped", "sirens ended", "sirens cleared",
  "sirens have stopped", "all clear", "siren all-clear",
  "sirens no longer", "sirens silent", "sirens off",
  "alarm ended", "alarm cleared", "alarm over",
  "false alarm", "test siren", "siren test",
  "returned to normal", "alert lifted",
  "alert canceled", "alert cancelled",
  // Arabic
  "انتهاء الإنذار", "إنذار كاذب", "رفع الإنذار",
  // Persian
  "پایان آژیر", "آژیر خاموش",
];

// --- Country dictionary (keyword → display name) ---

interface CountryEntry {
  keywords: string[];
  displayName: string;
}

const COUNTRIES: CountryEntry[] = [
  { keywords: ["iran", "iranian", "tehran", "isfahan", "esfahan", "tabriz", "shiraz", "ahvaz", "mashhad", "bushehr", "bandar abbas", "qom", "karaj", "kerman"], displayName: "Iran" },
  { keywords: ["lebanon", "lebanese", "beirut", "dahieh", "dahiyeh", "tyre", "sidon", "saida", "nabatieh", "bekaa", "beqaa", "baalbek", "south lebanon"], displayName: "Lebanon" },
  { keywords: ["syria", "syrian", "damascus", "aleppo", "homs", "latakia", "deir ez-zor", "deir ezzor", "idlib"], displayName: "Syria" },
  { keywords: ["iraq", "iraqi", "baghdad", "erbil", "basra", "mosul", "kirkuk", "najaf", "karbala"], displayName: "Iraq" },
  { keywords: ["yemen", "yemeni", "sanaa", "sana'a", "hodeidah", "hudaydah", "aden", "marib"], displayName: "Yemen" },
  { keywords: ["gaza", "gaza strip", "rafah", "khan younis", "khan yunis", "jabalia", "jabaliya", "nuseirat", "deir al-balah"], displayName: "Gaza" },
  { keywords: ["jordan", "jordanian", "amman"], displayName: "Jordan" },
  { keywords: ["saudi", "saudi arabia", "riyadh", "jeddah", "dammam", "dhahran", "abqaiq"], displayName: "Saudi Arabia" },
  { keywords: ["uae", "emirates", "dubai", "abu dhabi", "fujairah", "sharjah"], displayName: "UAE" },
  { keywords: ["bahrain", "manama"], displayName: "Bahrain" },
  { keywords: ["kuwait", "kuwait city"], displayName: "Kuwait" },
  { keywords: ["qatar", "doha"], displayName: "Qatar" },
  { keywords: ["oman", "omani", "muscat", "salalah"], displayName: "Oman" },
  { keywords: ["turkey", "turkish", "ankara", "istanbul", "hatay", "gaziantep", "kilis", "sanliurfa"], displayName: "Turkey" },
  { keywords: ["pakistan", "pakistani", "islamabad", "karachi", "lahore"], displayName: "Pakistan" },
  { keywords: ["ukraine", "ukrainian", "kyiv", "kharkiv", "odessa"], displayName: "Ukraine" },
];

// Israel exclusion — skip these entirely (Tzeva Adom handles Israel)
const ISRAEL_KEYWORDS = [
  "israel", "israeli", "tel aviv", "jerusalem", "haifa", "beer sheva",
  "be'er sheva", "ashkelon", "ashdod", "netanya", "eilat", "sderot",
  "kiryat shmona", "nahariya", "tiberias", "herzliya", "petah tikva",
  "rishon lezion", "nazareth", "golan", "nevatim", "ramat david",
  "hatzerim", "palmachim", "ramon", "dimona", "tel nof",
  "tzeva adom", "red alert", "צבע אדום", "pikud haoref",
  "home front command", "galilee", "negev", "west bank",
  "northern israel", "southern israel", "central israel",
  "iron dome", "david's sling", "arrow",
];

// --- Server-side active siren state ---

const activeSirens = new Map<string, SirenAlert & { expiresAt: number }>();

const SIREN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes auto-expire
const SUPPRESS_DURATION_MS = 60 * 60 * 1000; // 1 hour suppress after admin clear

// Countries suppressed by admin — won't be auto-recreated from Telegram
// Key: lowercase country name, Value: suppress until timestamp
const suppressedCountries = new Map<string, number>();

let lastProcessedAt = 0;

// --- Detection helpers ---

function extractCountry(text: string): string | null {
  const lower = text.toLowerCase();

  // Find ALL matching countries
  const matches: { name: string; index: number }[] = [];
  for (const entry of COUNTRIES) {
    for (const kw of entry.keywords) {
      const idx = lower.indexOf(kw);
      if (idx !== -1) {
        matches.push({ name: entry.displayName, index: idx });
        break;
      }
    }
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].name;

  // Multiple countries found — determine the TARGET (not the attacker).
  // Patterns like "X under attack from Y", "Y attacks X", "Y strikes X"
  // → the country after "from" or "by" in attack context is the ATTACKER.
  const attackerPatterns = [
    /(?:attack|struck|strike|bomb|shell|assault|raid)\w*\s+(?:from|by)\s+/i,
    /from\s+(?:iran|iranian|israel|israeli|us |american)/i,
  ];

  for (const pattern of attackerPatterns) {
    const m = text.match(pattern);
    if (m) {
      const afterFrom = text.slice((m.index || 0) + m[0].length).toLowerCase();
      // Find which matched country appears in the "from/by" clause — that's the attacker
      const attacker = matches.find((c) =>
        COUNTRIES.find((e) => e.displayName === c.name)?.keywords.some((kw) => afterFrom.startsWith(kw) || lower.slice(m.index || 0).includes(kw))
      );
      if (attacker) {
        // Return the OTHER country (the target)
        const target = matches.find((c) => c.name !== attacker.name);
        if (target) return target.name;
      }
    }
  }

  // Fallback: return the country that appears first in the text (likely the subject/target)
  matches.sort((a, b) => a.index - b.index);
  return matches[0].name;
}

function hasSirenKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return SIREN_ACTIVATE_KEYWORDS.some((kw) => lower.includes(kw));
}

function hasClearKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return SIREN_CLEAR_KEYWORDS.some((kw) => lower.includes(kw));
}

function isAboutIsrael(text: string): boolean {
  const lower = text.toLowerCase();
  return ISRAEL_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Returns true if /api/feed has processed posts recently (within 2 min) */
export function hasRecentProcessing(): boolean {
  return Date.now() - lastProcessedAt < 2 * 60 * 1000;
}

/**
 * Process a batch of Telegram posts and update the active siren state.
 * Called as a side effect from /api/feed.
 */
/** Load suppression list from Redis — always reload to sync across serverless instances. */
async function loadSuppressions(): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const raw = await r.hgetall("siren_suppressed");
    if (!raw || typeof raw !== "object") return;
    const now = Date.now();
    for (const [country, until] of Object.entries(raw)) {
      const ts = Number(until);
      if (ts > now) {
        suppressedCountries.set(country, ts);
      } else {
        suppressedCountries.delete(country);
        r.hdel("siren_suppressed", country).catch(() => {});
      }
    }
  } catch { /* ignore */ }
}

export async function processSirenPosts(posts: Array<{
  id: string;
  channelUsername: string;
  text: string;
  timestamp: string;
}>): Promise<void> {
  // Must await suppression load before checking
  await loadSuppressions();

  const now = Date.now();
  lastProcessedAt = now;

  console.log(`[siren] Processing ${posts.length} posts for siren detection`);

  let activated = 0;
  let cleared = 0;

  for (const post of posts) {
    const text = post.text;
    if (!text || text.length < 10) continue;

    const country = extractCountry(text);
    if (!country) continue;

    // Skip Israel-related posts
    if (isAboutIsrael(text)) continue;

    // Check for siren clear first
    if (hasClearKeywords(text)) {
      for (const [id, siren] of activeSirens) {
        if (siren.country === country && siren.status === "active") {
          activeSirens.delete(id);
          cleared++;
          console.log(`[siren] CLEARED: ${country} (post: ${post.id})`);
        }
      }
      continue;
    }

    // Check for siren activation
    if (hasSirenKeywords(text)) {
      // Skip if this country was recently cleared by admin
      const suppressUntil = suppressedCountries.get(country.toLowerCase());
      if (suppressUntil && now < suppressUntil) continue;

      // Extend existing siren for this country
      let existing = false;
      for (const siren of activeSirens.values()) {
        if (siren.country === country && siren.status === "active") {
          siren.lastSeenAt = now;
          siren.expiresAt = now + SIREN_EXPIRY_MS;
          existing = true;
          break;
        }
      }

      if (!existing) {
        const alertId = `siren-${post.channelUsername}-${post.id.replace("/", "-")}-${now}`;
        activeSirens.set(alertId, {
          id: alertId,
          country,
          activatedAt: now,
          lastSeenAt: now,
          sourceChannel: post.channelUsername,
          sourceText: text.slice(0, 200),
          status: "active",
          expiresAt: now + SIREN_EXPIRY_MS,
        });
        activated++;
        console.log(`[siren] ACTIVATED: ${country} via ${post.channelUsername} (post: ${post.id})`);
        console.log(`[siren]   text: ${text.slice(0, 120)}`);
      }
    }
  }

  // Expire old sirens
  for (const [id, siren] of activeSirens) {
    if (now > siren.expiresAt) {
      console.log(`[siren] EXPIRED: ${siren.country}`);
      activeSirens.delete(id);
    }
  }

  if (activated > 0 || cleared > 0 || activeSirens.size > 0) {
    console.log(`[siren] Result: ${activated} new, ${cleared} cleared, ${activeSirens.size} active`);
  }
}

/**
 * Return all currently active (non-expired) siren alerts.
 * Merges in-memory (auto-detected) with Redis (manual) sirens.
 */
export async function getActiveSirenAlerts(): Promise<SirenAlert[]> {
  // Always reload suppressions from Redis to stay in sync across serverless instances
  await loadSuppressions();

  const now = Date.now();
  for (const [id, siren] of activeSirens) {
    if (now > siren.expiresAt) {
      activeSirens.delete(id);
    }
    // Also remove sirens for suppressed countries (cleared on another instance)
    const suppressUntil = suppressedCountries.get(siren.country.toLowerCase());
    if (suppressUntil && now < suppressUntil) {
      activeSirens.delete(id);
    }
  }
  const inMemory = Array.from(activeSirens.values())
    .filter((s) => s.status === "active")
    .map(({ expiresAt: _, ...rest }) => rest);

  // Merge Redis manual sirens
  const r = getRedis();
  if (!r) return inMemory;

  try {
    const raw = await r.hgetall(REDIS_MANUAL_SIRENS_KEY);
    if (!raw || typeof raw !== "object") return inMemory;

    const ids = new Set(inMemory.map((a) => a.id));
    for (const [id, value] of Object.entries(raw)) {
      const siren: SirenAlert & { expiresAt?: number } =
        typeof value === "string" ? JSON.parse(value) : value as SirenAlert & { expiresAt?: number };
      if (siren.expiresAt && now > siren.expiresAt) {
        r.hdel(REDIS_MANUAL_SIRENS_KEY, id).catch(() => {});
        continue;
      }
      if (!ids.has(siren.id)) {
        const { expiresAt: _, ...rest } = siren;
        inMemory.push(rest);
      }
    }
  } catch (err) {
    console.error("[siren] Failed to load manual sirens from Redis:", err);
  }
  return inMemory;
}

/**
 * Manually activate a siren for a country. Persists to Redis.
 */
export async function addManualSiren(country: string): Promise<SirenAlert> {
  const now = Date.now();
  const id = `siren-manual-${now}`;
  const alert: SirenAlert & { expiresAt: number } = {
    id,
    country,
    activatedAt: now,
    lastSeenAt: now,
    sourceChannel: "admin",
    sourceText: `Manual siren activated for ${country}`,
    status: "active",
    expiresAt: now + SIREN_EXPIRY_MS,
  };
  activeSirens.set(id, alert);
  // Un-suppress this country since admin is explicitly activating it
  suppressedCountries.delete(country.toLowerCase());
  console.log(`[siren] MANUAL ACTIVATED: ${country}`);

  const r = getRedis();
  if (r) {
    await r.hset(REDIS_MANUAL_SIRENS_KEY, { [id]: JSON.stringify(alert) });
    r.hdel("siren_suppressed", country.toLowerCase()).catch(() => {});
  }

  const { expiresAt: _, ...rest } = alert;
  return rest;
}

/**
 * Clear all active sirens for a specific country. Used by admin UI.
 */
export async function clearSirenByCountry(country: string): Promise<number> {
  let cleared = 0;
  const r = getRedis();
  for (const [id, siren] of activeSirens) {
    if (siren.country.toLowerCase() === country.toLowerCase() && siren.status === "active") {
      activeSirens.delete(id);
      if (r) r.hdel(REDIS_MANUAL_SIRENS_KEY, id).catch(() => {});
      cleared++;
    }
  }
  // Also clear from Redis directly
  if (r) {
    try {
      const raw = await r.hgetall(REDIS_MANUAL_SIRENS_KEY);
      if (raw && typeof raw === "object") {
        for (const [id, value] of Object.entries(raw)) {
          const siren: SirenAlert = typeof value === "string" ? JSON.parse(value) : value as SirenAlert;
          if (siren.country.toLowerCase() === country.toLowerCase()) {
            await r.hdel(REDIS_MANUAL_SIRENS_KEY, id);
            cleared++;
          }
        }
      }
    } catch { /* ignore */ }
  }
  // Suppress this country from being auto-recreated by Telegram scraper
  const now = Date.now();
  suppressedCountries.set(country.toLowerCase(), now + SUPPRESS_DURATION_MS);
  const r2 = getRedis();
  if (r2) {
    r2.hset("siren_suppressed", { [country.toLowerCase()]: String(now + SUPPRESS_DURATION_MS) }).catch(() => {});
  }

  if (cleared > 0) {
    console.log(`[siren] ADMIN CLEARED: ${country} (${cleared} alerts, suppressed for 1h)`);
  }
  return cleared;
}

/**
 * Clear all active sirens. Used by admin UI.
 */
export async function clearAllSirens(): Promise<number> {
  const now = Date.now();
  // Suppress all currently active countries
  for (const siren of activeSirens.values()) {
    suppressedCountries.set(siren.country.toLowerCase(), now + SUPPRESS_DURATION_MS);
  }
  const count = activeSirens.size;
  activeSirens.clear();
  const r = getRedis();
  if (r) {
    await r.del(REDIS_MANUAL_SIRENS_KEY);
    // Persist suppressions to Redis
    if (suppressedCountries.size > 0) {
      const entries: Record<string, string> = {};
      for (const [c, until] of suppressedCountries) entries[c] = String(until);
      r.hset("siren_suppressed", entries).catch(() => {});
    }
  }
  if (count > 0) {
    console.log(`[siren] ADMIN CLEARED ALL: ${count} alerts, countries suppressed for 1h`);
  }
  return count;
}
