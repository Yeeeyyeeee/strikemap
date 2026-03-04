interface Coords {
  lat: number;
  lng: number;
}

// ~60 Israeli cities and regions commonly referenced in Tzeva Adom alerts
const CITY_COORDS: Record<string, Coords> = {
  // Major cities
  "tel aviv": { lat: 32.0853, lng: 34.7818 },
  jerusalem: { lat: 31.7683, lng: 35.2137 },
  haifa: { lat: 32.794, lng: 34.9896 },
  "beer sheva": { lat: 31.253, lng: 34.7915 },
  "be'er sheva": { lat: 31.253, lng: 34.7915 },
  beersheba: { lat: 31.253, lng: 34.7915 },
  ashdod: { lat: 31.8044, lng: 34.6553 },
  ashkelon: { lat: 31.6688, lng: 34.5743 },
  netanya: { lat: 32.3215, lng: 34.8532 },
  herzliya: { lat: 32.1629, lng: 34.8447 },
  "rishon lezion": { lat: 31.973, lng: 34.7925 },
  "petah tikva": { lat: 32.0841, lng: 34.8878 },
  holon: { lat: 32.0114, lng: 34.7748 },
  "bnei brak": { lat: 32.0834, lng: 34.8344 },
  "ramat gan": { lat: 32.07, lng: 34.8243 },
  "bat yam": { lat: 32.0173, lng: 34.7503 },
  rehovot: { lat: 31.8928, lng: 34.8113 },
  "kfar saba": { lat: 32.1715, lng: 34.907 },
  "ra'anana": { lat: 32.1836, lng: 34.871 },
  modiin: { lat: 31.899, lng: 35.0101 },
  nazareth: { lat: 32.6996, lng: 35.3035 },
  eilat: { lat: 29.5577, lng: 34.9519 },

  // Southern cities (near Gaza)
  sderot: { lat: 31.525, lng: 34.597 },
  ofakim: { lat: 31.3171, lng: 34.6192 },
  netivot: { lat: 31.4211, lng: 34.5868 },
  "kiryat gat": { lat: 31.6101, lng: 34.7642 },
  "kiryat malakhi": { lat: 31.7333, lng: 34.75 },
  yavne: { lat: 31.8788, lng: 34.7394 },
  arad: { lat: 31.2589, lng: 35.2126 },
  dimona: { lat: 31.0682, lng: 35.0323 },

  // Northern cities (near Lebanon)
  nahariya: { lat: 33.0039, lng: 35.0933 },
  akko: { lat: 32.9261, lng: 35.0764 },
  acre: { lat: 32.9261, lng: 35.0764 },
  "kiryat shmona": { lat: 33.2082, lng: 35.5705 },
  tiberias: { lat: 32.794, lng: 35.53 },
  safed: { lat: 32.9646, lng: 35.496 },
  tzfat: { lat: 32.9646, lng: 35.496 },
  carmiel: { lat: 32.919, lng: 35.3002 },
  afula: { lat: 32.607, lng: 35.2881 },
  "beit shean": { lat: 32.4971, lng: 35.4976 },
  yokneam: { lat: 32.6594, lng: 35.1094 },

  // Central
  "beit shemesh": { lat: 31.7512, lng: 34.9942 },
  lod: { lat: 31.953, lng: 34.8916 },
  ramla: { lat: 31.9291, lng: 34.8663 },
  gedera: { lat: 31.8147, lng: 34.7793 },

  // Golan
  katzrin: { lat: 32.9916, lng: 35.692 },

  // Regions
  dan: { lat: 32.0853, lng: 34.7818 }, // Tel Aviv metro
  sharon: { lat: 32.3, lng: 34.87 },
  hasharon: { lat: 32.3, lng: 34.87 },
  negev: { lat: 31.25, lng: 34.79 },
  "western negev": { lat: 31.4, lng: 34.55 },
  galilee: { lat: 32.9, lng: 35.3 },
  "upper galilee": { lat: 33.05, lng: 35.5 },
  "lower galilee": { lat: 32.75, lng: 35.35 },
  golan: { lat: 32.95, lng: 35.75 },
  "golan heights": { lat: 32.95, lng: 35.75 },
  judea: { lat: 31.55, lng: 35.1 },
  samaria: { lat: 32.2, lng: 35.25 },
  "dead sea": { lat: 31.5, lng: 35.47 },
  "coastal plain": { lat: 31.9, lng: 34.75 },
  shephelah: { lat: 31.7, lng: 34.85 },
  "hof ashkelon": { lat: 31.65, lng: 34.56 },
  eshkol: { lat: 31.32, lng: 34.42 },
  "sdot negev": { lat: 31.46, lng: 34.53 },
  "sha'ar hanegev": { lat: 31.51, lng: 34.53 },
  lakhish: { lat: 31.57, lng: 34.72 },
  merhavim: { lat: 31.31, lng: 34.63 },
  "jezreel valley": { lat: 32.6, lng: 35.3 },
  carmel: { lat: 32.75, lng: 35.0 },
};

/**
 * Look up coordinates for an Israeli city or region name.
 * Returns null if not found.
 */
export function geocodeIsraeliLocation(name: string): Coords | null {
  const normalized = name.toLowerCase().trim();

  // Direct match
  if (CITY_COORDS[normalized]) {
    return CITY_COORDS[normalized];
  }

  // Partial match — find the first key that's contained in the input or vice versa
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }

  return null;
}

/**
 * Infer a plausible missile launch origin based on target coordinates,
 * threat type, and countdown time.
 *
 * Key insight: the Tzeva Adom countdown tells us distance:
 *   - 0-15s  → Gaza (very close)
 *   - 15-45s → Lebanon/Syria (nearby)
 *   - 60s+   → Iran/Iraq/Yemen (long-range ballistic)
 *
 * threatType also helps: "drone" with long countdown = Iran (Shahed),
 * "missile" with long countdown = Iran (ballistic).
 */
export function getOriginForTarget(
  targetLat: number,
  targetLng: number,
  threatType?: "missile" | "drone" | "unknown",
  countdown?: number
): Coords {
  // Long countdown (90s+) → long-range from Iran, regardless of target location
  if (countdown && countdown >= 90) {
    if (threatType === "drone") {
      // Drones launched from western Iran (closer staging)
      return { lat: 33.49, lng: 48.35 }; // Khorramabad, Iran (western launch site)
    }
    return { lat: 32.65, lng: 51.68 }; // Isfahan, Iran (ballistic missile)
  }

  // Medium countdown (45-89s) → Iraq/Syria proxies or Iran
  if (countdown && countdown >= 45) {
    // Could be Iran or Iraq-based proxies
    if (targetLat > 32.5) {
      // Northern target with medium countdown → could be Syria/Iraq
      return { lat: 34.8, lng: 47.07 }; // Kermanshah, Iran (western border)
    }
    return { lat: 32.65, lng: 51.68 }; // Isfahan, Iran
  }

  // Short countdown or no countdown data → use geography
  // Gaza targets (southern, very short countdown)
  if (countdown && countdown <= 15 && targetLat < 31.8) {
    return { lat: 31.5, lng: 34.47 }; // Gaza
  }

  // Northern Israel (above Haifa lat) with short countdown → Lebanon
  if (targetLat > 32.5) {
    if (targetLng > 35.3) {
      return { lat: 33.85, lng: 36.05 }; // Bekaa Valley, Lebanon
    }
    return { lat: 33.3, lng: 35.45 }; // South Lebanon / Nabatieh area
  }

  // Central Israel — default to Iran (ballistic)
  if (targetLat >= 31.4) {
    return { lat: 32.65, lng: 51.68 }; // Isfahan, Iran
  }

  // Southern Israel — Iran
  return { lat: 32.0, lng: 52.5 }; // Central Iran
}
