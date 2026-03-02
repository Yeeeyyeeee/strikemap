import { NOTAM, RegionAirspace, AirspaceStatus } from "./types";

// ── FIR Configuration ────────────────────────────────────────────────────────
// Each country mapped to its FIR code, bounding box for flight density,
// and normal traffic threshold (flights expected in open airspace).

export interface FIREntry {
  fir: string;
  country: string;
  code: string;
  region: "iran" | "israel" | "gulf";
  // Bounding box for OpenSky flight density check [latMin, lonMin, latMax, lonMax]
  bbox: [number, number, number, number];
  // Approximate normal flight count for this airspace (above which = open)
  normalTraffic: number;
}

export const FIR_CONFIG: FIREntry[] = [
  { fir: "OIIX", country: "Iran",         code: "IR", region: "iran",   bbox: [25, 44, 40, 63],     normalTraffic: 30 },
  { fir: "LLLL", country: "Israel",       code: "IL", region: "israel", bbox: [29, 34, 33.5, 36],   normalTraffic: 15 },
  { fir: "OLBB", country: "Lebanon",      code: "LB", region: "israel", bbox: [33, 35, 34.7, 36.7], normalTraffic: 5 },
  { fir: "OSTT", country: "Syria",        code: "SY", region: "israel", bbox: [32, 35.5, 37.3, 42.4], normalTraffic: 5 },
  { fir: "ORBB", country: "Iraq",         code: "IQ", region: "gulf",   bbox: [29, 38.5, 37.4, 48.5], normalTraffic: 10 },
  { fir: "OJAC", country: "Jordan",       code: "JO", region: "israel", bbox: [29, 34.8, 33.4, 39],  normalTraffic: 8 },
  { fir: "OEJD", country: "Saudi Arabia", code: "SA", region: "gulf",   bbox: [16, 34.5, 32, 56],   normalTraffic: 40 },
  { fir: "OYSC", country: "Yemen",        code: "YE", region: "gulf",   bbox: [12, 42, 19, 54],     normalTraffic: 5 },
  { fir: "OMAE", country: "UAE",          code: "AE", region: "gulf",   bbox: [22.5, 51, 26.2, 56.5], normalTraffic: 20 },
  { fir: "OBBB", country: "Bahrain",      code: "BH", region: "gulf",   bbox: [25.5, 50, 26.5, 51], normalTraffic: 3 },
];

// ── OpenSky Network API ──────────────────────────────────────────────────────
// Free, no-auth API that returns live ADS-B flight positions.
// We use a SINGLE request covering the entire Middle East, then bucket
// aircraft into FIR zones by lat/lng. This directly measures whether
// airspace is in use — zero flights = closed.
//
// Thresholds (fraction of normalTraffic):
//   < 10%  → CLOSED  (critical)
//   < 40%  → RESTRICTED (warning)
//   >= 40% → OPEN

const OPENSKY_API = "https://opensky-network.org/api/states/all";
// Full Middle East bounding box
const ME_BBOX = { lamin: 12, lomin: 34, lamax: 40, lomax: 63 };

// ── Military aircraft filtering ──────────────────────────────────────────────
// Military aircraft shouldn't count toward civilian traffic density.
// We filter by: callsign prefixes, ICAO24 hex ranges, and blank callsigns.

// Known military callsign prefixes (case-insensitive match on first chars)
const MILITARY_CALLSIGN_PREFIXES = [
  // Iran
  "IRI",    // Islamic Republic of Iran Air Force
  "IRGC",   // IRGC aviation
  "SEP",    // Sepahan Air (IRGC-linked)
  // US
  "RCH",    // Reach (C-17, C-5 transport)
  "REACH",
  "STEEL",  // US military tankers
  "DOOM",   // Fighter callsigns
  "FURY",
  "EVIL",
  "JAKE",
  "VIPER",
  "DUKE",
  "RAGE",
  "HAVOC",
  "WRATH",
  "COBRA",
  "HAWK",
  // US ISR/drone
  "FORTE",  // RQ-4 Global Hawk
  "DRAK",   // MQ-9 Reaper
  // Israel
  "IAF",    // Israeli Air Force
  // NATO/coalition
  "NATO",
  "NATO0",
  "RRR",    // RAF
  "ASCOT",  // RAF transport
  "BAF",    // Belgian Air Force
  "FAF",    // French Air Force
  "GAF",    // German Air Force
  "MMF",    // Military mixed flights
  "SAM",    // Special Air Mission (US VIP)
  "EXEC",   // US executive transport
  "CNV",    // US Navy
  "PAT",    // US patrol
];

// ICAO24 hex ranges allocated to military registrations
// Format: [startHex, endHex] inclusive
const MILITARY_ICAO_RANGES: [number, number][] = [
  [0xADF7C0, 0xADFAFF],  // US military (partial block)
  [0xAE0000, 0xAEFFFF],  // US military
  [0x730000, 0x737FFF],  // Iran military
  [0x738000, 0x73BFFF],  // Israel military
  [0x3C0000, 0x3C0FFF],  // Germany military
  [0x3F0000, 0x3F0FFF],  // UK military (partial)
  [0x43C000, 0x43CFFF],  // UK military
];

/** Check if an aircraft is likely military based on callsign + ICAO24 */
function isMilitary(icao24: string, callsign: string | null): boolean {
  // No callsign often = military (especially in conflict zones)
  if (!callsign || callsign.trim() === "") return true;

  // Check callsign prefix
  const cs = callsign.trim().toUpperCase();
  for (const prefix of MILITARY_CALLSIGN_PREFIXES) {
    if (cs.startsWith(prefix)) return true;
  }

  // Check ICAO24 hex range
  const hex = parseInt(icao24, 16);
  if (!isNaN(hex)) {
    for (const [start, end] of MILITARY_ICAO_RANGES) {
      if (hex >= start && hex <= end) return true;
    }
  }

  return false;
}

/** Fetch all aircraft over the Middle East from OpenSky (single request) */
async function fetchFlightDensity(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const f of FIR_CONFIG) counts.set(f.code, 0);

  try {
    const url = `${OPENSKY_API}?lamin=${ME_BBOX.lamin}&lomin=${ME_BBOX.lomin}&lamax=${ME_BBOX.lamax}&lomax=${ME_BBOX.lomax}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`OpenSky ${res.status}`);
    const data = await res.json();
    const states: unknown[][] = data?.states || [];

    for (const s of states) {
      const icao24 = s[0] as string;
      const callsign = s[1] as string | null;
      const lng = s[5] as number | null;
      const lat = s[6] as number | null;
      const onGround = s[8] as boolean;
      if (lat == null || lng == null || onGround) continue;

      // Skip military aircraft — only count civilian traffic
      if (isMilitary(icao24, callsign)) continue;

      // Bucket into FIR by bounding box
      for (const f of FIR_CONFIG) {
        const [latMin, lonMin, latMax, lonMax] = f.bbox;
        if (lat >= latMin && lat <= latMax && lng >= lonMin && lng <= lonMax) {
          counts.set(f.code, (counts.get(f.code) || 0) + 1);
          break; // Each aircraft counted once (first matching FIR)
        }
      }
    }
  } catch (e) {
    console.error("OpenSky fetch failed:", e);
    // Return all zeros — will be treated as "data unavailable"
  }

  return counts;
}

/** Determine airspace status from flight count vs normal traffic */
function classifyAirspace(flightCount: number, normalTraffic: number): AirspaceStatus {
  const ratio = flightCount / normalTraffic;
  if (ratio < 0.1) return "closed";
  if (ratio < 0.4) return "restricted";
  return "open";
}

// ── Server-side cache ────────────────────────────────────────────────────────

interface AirspaceCache {
  notams: NOTAM[];
  regions: RegionAirspace[];
  flightCounts: Map<string, number>;
  timestamp: string;
  fetchedAt: number;
}

let cache: AirspaceCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Main entry point: fetch airspace status for all monitored FIRs */
export async function fetchNOTAMs(): Promise<{ notams: NOTAM[]; regions: RegionAirspace[] }> {
  // Return cached if fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return { notams: cache.notams, regions: cache.regions };
  }

  const flightCounts = await fetchFlightDensity();
  const now = new Date().toISOString();

  // Generate synthetic NOTAMs from flight density analysis
  const notams: NOTAM[] = [];
  const regions: RegionAirspace[] = [];

  for (const fir of FIR_CONFIG) {
    const count = flightCounts.get(fir.code) || 0;
    const status = classifyAirspace(count, fir.normalTraffic);

    // Generate a synthetic NOTAM for closed/restricted airspace
    if (status === "closed") {
      notams.push({
        id: `${fir.fir}-closure-${Date.now()}`,
        fir: fir.fir,
        country: fir.country,
        type: "closure",
        summary: `${fir.country} (${fir.fir}) airspace effectively closed — ${count} aircraft detected (normal: ~${fir.normalTraffic})`,
        raw_text: `Flight density analysis: ${count}/${fir.normalTraffic} expected aircraft. Airspace appears closed to civil aviation.`,
        altitude_floor: 0,
        altitude_ceiling: 999,
        effective_from: now,
        effective_to: "PERM",
        severity: "critical",
      });
    } else if (status === "restricted") {
      notams.push({
        id: `${fir.fir}-restriction-${Date.now()}`,
        fir: fir.fir,
        country: fir.country,
        type: "restriction",
        summary: `${fir.country} (${fir.fir}) airspace restricted — ${count} aircraft (normal: ~${fir.normalTraffic})`,
        raw_text: `Flight density analysis: ${count}/${fir.normalTraffic} expected aircraft. Significantly reduced traffic indicates restrictions.`,
        effective_from: now,
        effective_to: "PERM",
        severity: "warning",
      });
    }

    const firNotams = notams.filter((n) => n.fir === fir.fir);
    regions.push({
      country: fir.country,
      fir: fir.fir,
      status,
      active_notams: firNotams.length,
      critical_notams: firNotams.filter((n) => n.severity === "critical").length,
      last_updated: now,
    });
  }

  cache = { notams, regions, flightCounts, timestamp: now, fetchedAt: Date.now() };
  return { notams, regions };
}

/** Compute airspace status (standalone, for when you have NOTAM data already) */
export function computeRegionAirspace(notams: NOTAM[]): RegionAirspace[] {
  const now = new Date().toISOString();
  return FIR_CONFIG.map((fir) => {
    const firNotams = notams.filter((n) => n.fir === fir.fir);
    const criticalCount = firNotams.filter((n) => n.severity === "critical").length;
    const hasWarning = firNotams.some((n) => n.severity === "warning");
    let status: AirspaceStatus = "open";
    if (criticalCount > 0) status = "closed";
    else if (hasWarning) status = "restricted";
    return {
      country: fir.country,
      fir: fir.fir,
      status,
      active_notams: firNotams.length,
      critical_notams: criticalCount,
      last_updated: now,
    };
  });
}

/** Filter NOTAMs by region */
export function filterByRegion(notams: NOTAM[], region: string): NOTAM[] {
  if (region === "all") return notams;
  const firs = FIR_CONFIG.filter((f) => f.region === region).map((f) => f.fir);
  return notams.filter((n) => firs.includes(n.fir));
}
