/**
 * Known launch site database and smart origin selection.
 */

import { haversineKm } from "./geo";

export type ThreatClass = "ballistic" | "cruise" | "drone" | "rocket";

export interface LaunchSite {
  name: string;
  lat: number;
  lng: number;
  threats: ThreatClass[];
  priority: number; // lower = preferred
  maxRangeKm: number;
  region: string; // "iran" | "gaza" | "lebanon" | "syria" | "yemen" | "iraq"
}

// ~18 known launch sites grouped by region
const LAUNCH_SITES: LaunchSite[] = [
  // Iran (6)
  {
    name: "Isfahan",
    lat: 32.6546,
    lng: 51.668,
    threats: ["ballistic", "cruise"],
    priority: 1,
    maxRangeKm: 2500,
    region: "iran",
  },
  {
    name: "Tabriz",
    lat: 38.08,
    lng: 46.2919,
    threats: ["ballistic", "cruise"],
    priority: 2,
    maxRangeKm: 2000,
    region: "iran",
  },
  {
    name: "Khorramabad",
    lat: 33.49,
    lng: 48.35,
    threats: ["ballistic", "cruise", "drone"],
    priority: 2,
    maxRangeKm: 2000,
    region: "iran",
  },
  {
    name: "Dezful",
    lat: 32.3838,
    lng: 48.4035,
    threats: ["ballistic", "cruise", "drone"],
    priority: 3,
    maxRangeKm: 1800,
    region: "iran",
  },
  {
    name: "Shiraz",
    lat: 29.5918,
    lng: 52.5837,
    threats: ["ballistic", "cruise"],
    priority: 3,
    maxRangeKm: 2200,
    region: "iran",
  },
  {
    name: "Semnan",
    lat: 35.5729,
    lng: 53.3971,
    threats: ["ballistic"],
    priority: 4,
    maxRangeKm: 2500,
    region: "iran",
  },

  // Gaza (2)
  {
    name: "Northern Gaza",
    lat: 31.52,
    lng: 34.45,
    threats: ["rocket"],
    priority: 1,
    maxRangeKm: 45,
    region: "gaza",
  },
  {
    name: "Rafah",
    lat: 31.2969,
    lng: 34.2455,
    threats: ["rocket"],
    priority: 2,
    maxRangeKm: 40,
    region: "gaza",
  },

  // Lebanon (3)
  {
    name: "Nabatieh",
    lat: 33.38,
    lng: 35.48,
    threats: ["rocket", "cruise"],
    priority: 1,
    maxRangeKm: 250,
    region: "lebanon",
  },
  {
    name: "Bekaa Valley",
    lat: 33.85,
    lng: 36.05,
    threats: ["rocket", "cruise", "drone"],
    priority: 1,
    maxRangeKm: 300,
    region: "lebanon",
  },
  {
    name: "Baalbek",
    lat: 34.0047,
    lng: 36.211,
    threats: ["rocket", "cruise", "drone"],
    priority: 2,
    maxRangeKm: 350,
    region: "lebanon",
  },

  // Syria (2)
  {
    name: "T-4 (Tiyas)",
    lat: 34.5228,
    lng: 37.6272,
    threats: ["cruise", "drone"],
    priority: 2,
    maxRangeKm: 500,
    region: "syria",
  },
  {
    name: "Palmyra",
    lat: 34.5604,
    lng: 38.284,
    threats: ["cruise", "drone"],
    priority: 3,
    maxRangeKm: 600,
    region: "syria",
  },

  // Yemen (3)
  {
    name: "Sanaa",
    lat: 15.3694,
    lng: 44.191,
    threats: ["ballistic", "cruise", "drone"],
    priority: 1,
    maxRangeKm: 2500,
    region: "yemen",
  },
  {
    name: "Hodeidah",
    lat: 14.7979,
    lng: 42.9531,
    threats: ["cruise", "drone"],
    priority: 2,
    maxRangeKm: 2200,
    region: "yemen",
  },
  {
    name: "Dhamar",
    lat: 14.5426,
    lng: 44.405,
    threats: ["ballistic", "cruise"],
    priority: 2,
    maxRangeKm: 2500,
    region: "yemen",
  },

  // Iraq PMF (2)
  {
    name: "Jurf al-Sakhar",
    lat: 32.895,
    lng: 44.1,
    threats: ["rocket", "cruise", "drone"],
    priority: 2,
    maxRangeKm: 1000,
    region: "iraq",
  },
  {
    name: "Anbar",
    lat: 33.42,
    lng: 43.3,
    threats: ["cruise", "drone"],
    priority: 3,
    maxRangeKm: 1000,
    region: "iraq",
  },
];

/**
 * Classify the threat type from countdown time (seconds) and known threat type.
 */
function classifyThreat(
  countdown: number | undefined,
  threatType?: "missile" | "drone" | "unknown"
): ThreatClass[] {
  // If drone is explicitly known, return drone
  if (threatType === "drone") return ["drone"];

  if (countdown === undefined || countdown === 0) {
    return ["ballistic", "cruise", "rocket"];
  }

  if (countdown <= 15) return ["rocket"];
  if (countdown <= 45) return ["rocket", "cruise"];
  if (countdown <= 89) return ["cruise", "ballistic"];
  return ["ballistic"]; // 90s+
}

export interface LaunchOriginResult {
  lat: number;
  lng: number;
  siteName: string;
  threatClass: ThreatClass;
}

/**
 * Select the most likely launch origin for a given target.
 *
 * Algorithm:
 * 1. Classify threat from countdown
 * 2. Filter sites by threat capability + range
 * 3. Geographic heuristic (northern targets → prefer Lebanon/Syria)
 * 4. Pick by priority, then nearest
 */
export function selectLaunchOrigin(
  targetLat: number,
  targetLng: number,
  threatType?: "missile" | "drone" | "unknown",
  countdown?: number,
  originCountry?: string
): LaunchOriginResult {
  const threatClasses = classifyThreat(countdown, threatType);

  // If origin country is specified, filter sites to that region first
  const sitesToConsider = originCountry
    ? LAUNCH_SITES.filter((s) => s.region === originCountry.toLowerCase())
    : LAUNCH_SITES;

  // Filter: site must support at least one matching threat class AND target must be in range
  const candidates = sitesToConsider.filter((site) => {
    const hasCapability = site.threats.some((t) => threatClasses.includes(t));
    if (!hasCapability) return false;
    // Skip range check when origin is explicitly chosen
    if (originCountry) return true;
    const dist = haversineKm(site.lat, site.lng, targetLat, targetLng);
    return dist <= site.maxRangeKm;
  });

  if (candidates.length === 0) {
    // Fallback: Isfahan for ballistic, Bekaa for rockets, Khorramabad for drones
    if (threatClasses.includes("rocket")) {
      return { lat: 33.38, lng: 35.48, siteName: "Nabatieh", threatClass: "rocket" };
    }
    if (threatClasses.includes("drone")) {
      return { lat: 33.49, lng: 48.35, siteName: "Khorramabad", threatClass: "drone" };
    }
    return { lat: 32.6546, lng: 51.668, siteName: "Isfahan", threatClass: "ballistic" };
  }

  // Geographic heuristic: northern Israel targets prefer Lebanon/Syria origins for short/medium range
  let filtered = candidates;
  if (targetLat > 32.5 && (countdown === undefined || countdown <= 60)) {
    const nearby = candidates.filter((s) => {
      const dist = haversineKm(s.lat, s.lng, targetLat, targetLng);
      return dist < 400; // Lebanon/Syria range
    });
    if (nearby.length > 0) filtered = nearby;
  }

  // Sort by priority (lower first), then by distance to target
  filtered.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const distA = haversineKm(a.lat, a.lng, targetLat, targetLng);
    const distB = haversineKm(b.lat, b.lng, targetLat, targetLng);
    return distA - distB;
  });

  const best = filtered[0];

  // Pick the most specific matching threat class
  const matchingThreats = best.threats.filter((t) => threatClasses.includes(t));
  const threatClass = matchingThreats[0] || threatClasses[0];

  return {
    lat: best.lat,
    lng: best.lng,
    siteName: best.name,
    threatClass,
  };
}
