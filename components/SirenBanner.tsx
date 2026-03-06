"use client";

import { memo, useState, useEffect } from "react";
import { SirenAlertClient } from "@/hooks/useSirenPolling";

interface SirenBannerProps {
  alerts: SirenAlertClient[];
  /** Active Israel siren regions from Tzofar (e.g. ["South", "Central"]) */
  israelRegions?: string[];
}

export default memo(function SirenBanner({ alerts, israelRegions = [] }: SirenBannerProps) {
  const [dismissedCountries, setDismissedCountries] = useState(false);
  const [dismissedIsrael, setDismissedIsrael] = useState(false);

  // Reset Israel dismiss when regions change (new wave of alerts)
  const regionKey = israelRegions.join(",");
  useEffect(() => {
    if (regionKey) setDismissedIsrael(false);
  }, [regionKey]);

  const showCountries = alerts.length > 0 && !dismissedCountries;
  const showIsrael = israelRegions.length > 0 && !dismissedIsrael;

  if (!showCountries && !showIsrael) return null;

  const countries = [...new Set(alerts.map((a) => a.country))];
  const countryText = countries.join(", ");

  // Classify Israel regions into North / Central / South
  const regionDisplay = classifyRegions(israelRegions);

  return (
    <div className="fixed top-[56px] z-[55] pointer-events-none left-2 right-2 md:left-[17rem] md:right-[19rem] flex flex-col items-center gap-2">
      {/* Israel Tzofar siren banner */}
      {showIsrael && (
        <div className="siren-banner-inner pointer-events-auto px-3 py-2.5 md:px-6 md:py-3 rounded-lg border border-red-500/80 shadow-[0_0_40px_rgba(239,68,68,0.5)] max-w-xl w-full relative animate-pulse-border">
          <button
            onClick={() => setDismissedIsrael(true)}
            className="absolute top-1.5 right-1.5 text-white/40 hover:text-white transition-colors p-1"
            aria-label="Dismiss alert"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5 text-red-400 shrink-0 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span
              className="text-sm font-bold uppercase tracking-wider text-white"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Sirens going off in: {regionDisplay}
            </span>
            <svg className="w-5 h-5 text-red-400 shrink-0 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <p className="text-[10px] text-white/50 mt-1 text-center">
            via Tzofar (Tzeva Adom) &bull; TAKE SHELTER IMMEDIATELY
          </p>
        </div>
      )}

      {/* Non-Israel country siren banner */}
      {showCountries && (
        <div className="siren-banner-inner pointer-events-auto px-3 py-2.5 md:px-6 md:py-3 rounded-lg border border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.3)] max-w-xl w-full relative">
          <button
            onClick={() => setDismissedCountries(true)}
            className="absolute top-1.5 right-1.5 text-white/40 hover:text-white transition-colors p-1"
            aria-label="Dismiss alert"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5 text-white shrink-0 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span
              className="text-sm font-bold uppercase tracking-wider text-white"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Sirens reported in {countryText} — take shelter
            </span>
            <svg className="w-5 h-5 text-white shrink-0 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <p className="text-[10px] text-white/50 mt-1 text-center">
            via Telegram{alerts.length > 1 ? ` (${alerts.length} reports)` : ""} &bull;{" "}
            {new Date(alerts[0].activatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      )}
    </div>
  );
});

/**
 * Classify Tzofar area names into human-readable region groups.
 * Tzofar areas include names like "Lakhish", "HaShfela", "Dan", "HaNegev", etc.
 * We bucket them into North / Central / South Israel for the banner.
 */
function classifyRegions(regions: string[]): string {
  const north = new Set<string>();
  const central = new Set<string>();
  const south = new Set<string>();
  const other = new Set<string>();

  for (const r of regions) {
    const bucket = getRegionBucket(r);
    if (bucket === "north") north.add(r);
    else if (bucket === "central") central.add(r);
    else if (bucket === "south") south.add(r);
    else other.add(r);
  }

  const parts: string[] = [];
  if (north.size > 0) parts.push("Northern Israel");
  if (central.size > 0) parts.push("Central Israel");
  if (south.size > 0) parts.push("Southern Israel");
  for (const o of other) parts.push(o);

  if (parts.length === 0) return "Israel";
  return parts.join(", ");
}

/**
 * Map a Tzofar area English name to north/central/south bucket.
 * Based on standard Israeli geographic regions from Tzofar's cities.json.
 */
function getRegionBucket(area: string): "north" | "central" | "south" | "other" {
  const a = area.toLowerCase().trim();

  // Northern regions
  if (
    a.includes("galil") || a.includes("golan") || a.includes("haifa") ||
    a.includes("akko") || a.includes("acre") || a.includes("krayot") ||
    a.includes("carmel") || a.includes("jezreel") || a.includes("yizrael") ||
    a.includes("menashe") || a.includes("gilboa") || a.includes("safed") ||
    a.includes("tzfat") || a.includes("tiberias") || a.includes("tveria") ||
    a.includes("upper") || a.includes("north") || a.includes("finger") ||
    a.includes("hula") || a.includes("kineret") || a.includes("kinneret") ||
    a.includes("beit shean") || a.includes("wadi ara") || a.includes("megido") ||
    a.includes("nazareth") || a.includes("natzrat") || a.includes("zevulun") ||
    a === "emek" || a.includes("iron")
  ) {
    return "north";
  }

  // Southern regions
  if (
    a.includes("negev") || a.includes("arava") || a.includes("beer sheva") ||
    a.includes("be'er sheva") || a.includes("dead sea") || a.includes("eilat") ||
    a.includes("eshkol") || a.includes("sderot") || a.includes("gaza") ||
    a.includes("otef") || a.includes("lakhish") || a.includes("south") ||
    a.includes("ashkelon") || a.includes("kiryat gat") || a.includes("arad") ||
    a.includes("dimona") || a.includes("mitzpe ramon") || a.includes("rahat") ||
    a.includes("hof ashkelon") || a.includes("sha'ar hanegev") ||
    a.includes("sdot negev") || a.includes("bnei shimon") || a.includes("merhavim") ||
    a.includes("tamar") || a.includes("yoav")
  ) {
    return "south";
  }

  // Central regions
  if (
    a.includes("dan") || a.includes("tel aviv") || a.includes("gush dan") ||
    a.includes("sharon") || a.includes("shfela") || a.includes("shephelah") ||
    a.includes("hashfela") || a.includes("jerusalem") || a.includes("yerushalayim") ||
    a.includes("judea") || a.includes("samaria") || a.includes("shomron") ||
    a.includes("central") || a.includes("merkaz") || a.includes("netanya") ||
    a.includes("petah tikva") || a.includes("rehovot") || a.includes("ramla") ||
    a.includes("lod") || a.includes("rishon") || a.includes("holon") ||
    a.includes("bat yam") || a.includes("ramat gan") || a.includes("herzliya") ||
    a.includes("kfar saba") || a.includes("ra'anana") || a.includes("hod hasharon") ||
    a.includes("modiin") || a.includes("beit shemesh") || a.includes("ashdod") ||
    a.includes("gedera") || a.includes("yavne") || a.includes("inner") ||
    a.includes("coastal") || a.includes("emek hefer")
  ) {
    return "central";
  }

  return "other";
}
