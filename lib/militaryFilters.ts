/**
 * Military aircraft identification filters.
 * Shared between notam.ts (airspace density) and aircraft.ts (tracking layer).
 */

// Known military callsign prefixes (case-insensitive match on first chars)
export const MILITARY_CALLSIGN_PREFIXES = [
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
export const MILITARY_ICAO_RANGES: [number, number][] = [
  [0xADF7C0, 0xADFAFF],  // US military (partial block)
  [0xAE0000, 0xAEFFFF],  // US military
  [0x730000, 0x737FFF],  // Iran military
  [0x738000, 0x73BFFF],  // Israel military
  [0x3C0000, 0x3C0FFF],  // Germany military
  [0x3F0000, 0x3F0FFF],  // UK military (partial)
  [0x43C000, 0x43CFFF],  // UK military
];

/** Check if an aircraft is likely military based on callsign + ICAO24 */
export function isMilitary(icao24: string, callsign: string | null): boolean {
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
