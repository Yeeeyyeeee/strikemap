interface Coords {
  lat: number;
  lng: number;
}

// ~60 Israeli cities and regions commonly referenced in Tzeva Adom alerts
const CITY_COORDS: Record<string, Coords> = {
  // Major cities
  "tel aviv": { lat: 32.0853, lng: 34.7818 },
  "jerusalem": { lat: 31.7683, lng: 35.2137 },
  "haifa": { lat: 32.7940, lng: 34.9896 },
  "beer sheva": { lat: 31.2530, lng: 34.7915 },
  "be'er sheva": { lat: 31.2530, lng: 34.7915 },
  "beersheba": { lat: 31.2530, lng: 34.7915 },
  "ashdod": { lat: 31.8044, lng: 34.6553 },
  "ashkelon": { lat: 31.6688, lng: 34.5743 },
  "netanya": { lat: 32.3215, lng: 34.8532 },
  "herzliya": { lat: 32.1629, lng: 34.8447 },
  "rishon lezion": { lat: 31.9730, lng: 34.7925 },
  "petah tikva": { lat: 32.0841, lng: 34.8878 },
  "holon": { lat: 32.0114, lng: 34.7748 },
  "bnei brak": { lat: 32.0834, lng: 34.8344 },
  "ramat gan": { lat: 32.0700, lng: 34.8243 },
  "bat yam": { lat: 32.0173, lng: 34.7503 },
  "rehovot": { lat: 31.8928, lng: 34.8113 },
  "kfar saba": { lat: 32.1715, lng: 34.9070 },
  "ra'anana": { lat: 32.1836, lng: 34.8710 },
  "modiin": { lat: 31.8990, lng: 35.0101 },
  "nazareth": { lat: 32.6996, lng: 35.3035 },
  "eilat": { lat: 29.5577, lng: 34.9519 },

  // Southern cities (near Gaza)
  "sderot": { lat: 31.5250, lng: 34.5970 },
  "ofakim": { lat: 31.3171, lng: 34.6192 },
  "netivot": { lat: 31.4211, lng: 34.5868 },
  "kiryat gat": { lat: 31.6101, lng: 34.7642 },
  "kiryat malakhi": { lat: 31.7333, lng: 34.7500 },
  "yavne": { lat: 31.8788, lng: 34.7394 },
  "arad": { lat: 31.2589, lng: 35.2126 },
  "dimona": { lat: 31.0682, lng: 35.0323 },

  // Northern cities (near Lebanon)
  "nahariya": { lat: 33.0039, lng: 35.0933 },
  "akko": { lat: 32.9261, lng: 35.0764 },
  "acre": { lat: 32.9261, lng: 35.0764 },
  "kiryat shmona": { lat: 33.2082, lng: 35.5705 },
  "tiberias": { lat: 32.7940, lng: 35.5300 },
  "safed": { lat: 32.9646, lng: 35.4960 },
  "tzfat": { lat: 32.9646, lng: 35.4960 },
  "carmiel": { lat: 32.9190, lng: 35.3002 },
  "afula": { lat: 32.6070, lng: 35.2881 },
  "beit shean": { lat: 32.4971, lng: 35.4976 },
  "yokneam": { lat: 32.6594, lng: 35.1094 },

  // Central
  "beit shemesh": { lat: 31.7512, lng: 34.9942 },
  "lod": { lat: 31.9530, lng: 34.8916 },
  "ramla": { lat: 31.9291, lng: 34.8663 },
  "gedera": { lat: 31.8147, lng: 34.7793 },

  // Golan
  "katzrin": { lat: 32.9916, lng: 35.6920 },

  // Regions
  "dan": { lat: 32.0853, lng: 34.7818 }, // Tel Aviv metro
  "sharon": { lat: 32.3000, lng: 34.8700 },
  "hasharon": { lat: 32.3000, lng: 34.8700 },
  "negev": { lat: 31.2500, lng: 34.7900 },
  "western negev": { lat: 31.4000, lng: 34.5500 },
  "galilee": { lat: 32.9000, lng: 35.3000 },
  "upper galilee": { lat: 33.0500, lng: 35.5000 },
  "lower galilee": { lat: 32.7500, lng: 35.3500 },
  "golan": { lat: 32.9500, lng: 35.7500 },
  "golan heights": { lat: 32.9500, lng: 35.7500 },
  "judea": { lat: 31.5500, lng: 35.1000 },
  "samaria": { lat: 32.2000, lng: 35.2500 },
  "dead sea": { lat: 31.5000, lng: 35.4700 },
  "coastal plain": { lat: 31.9000, lng: 34.7500 },
  "shephelah": { lat: 31.7000, lng: 34.8500 },
  "hof ashkelon": { lat: 31.6500, lng: 34.5600 },
  "eshkol": { lat: 31.3200, lng: 34.4200 },
  "sdot negev": { lat: 31.4600, lng: 34.5300 },
  "sha'ar hanegev": { lat: 31.5100, lng: 34.5300 },
  "lakhish": { lat: 31.5700, lng: 34.7200 },
  "merhavim": { lat: 31.3100, lng: 34.6300 },
  "jezreel valley": { lat: 32.6000, lng: 35.3000 },
  "carmel": { lat: 32.7500, lng: 35.0000 },
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
 * Infer a plausible missile launch origin based on target coordinates.
 * Northern Israel targets → Hezbollah (southern Lebanon)
 * Central/Southern Israel targets → Iran (IRGC missile bases)
 */
export function getOriginForTarget(targetLat: number, targetLng: number): Coords {
  // Northern Israel (above Haifa) — likely Hezbollah from southern Lebanon
  if (targetLat > 32.5) {
    // Vary origin across southern Lebanon launch sites
    if (targetLng > 35.3) {
      return { lat: 33.85, lng: 36.05 }; // Bekaa Valley, Lebanon
    }
    return { lat: 33.30, lng: 35.45 }; // South Lebanon / Nabatieh area
  }

  // Central Israel (Tel Aviv area) — could be Iran or Hezbollah
  // Use Iran (longer range = ballistic missiles)
  if (targetLat >= 31.4) {
    return { lat: 32.65, lng: 51.68 }; // Isfahan, Iran
  }

  // Southern Israel (Negev, Beer Sheva, Eilat) — Iran
  return { lat: 32.0, lng: 52.5 }; // Central Iran
}
