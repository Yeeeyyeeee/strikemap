import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { REDIS_WIKIPEDIA_CASUALTIES_KEY, WIKIPEDIA_CASUALTIES_TTL_S } from "@/lib/constants";

interface SideCasualties {
  killed: number;
  injured: number;
  military: number;
  civilian: number;
}

export interface CasualtyData {
  iran: SideCasualties;
  usIsrael: SideCasualties;
  lastUpdated: string;
  source: string;
  articles: string[];
}

const WIKIPEDIA_ARTICLES = ["2026_Iran_conflict"];

const ARTICLE_DISPLAY_NAMES = ["2026 Iran conflict"];

/**
 * Strip wikitext markup: refs, templates, wiki links, HTML tags.
 * Keeps just the readable text for number extraction.
 */
function stripWikiMarkup(text: string): string {
  let s = text;
  // Remove <ref>...</ref> and <ref ... /> (these contain misleading titles/URLs)
  s = s.replace(/<ref[^>]*\/>/gi, "");
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  // Remove {{efn|...}} (endnotes with nested templates)
  // Handle nested braces by iteratively removing innermost templates first
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/\{\{[^{}]*\}\}/g, "");
  }
  // Remove remaining wiki links [[target|display]] → display, [[target]] → target
  s = s.replace(/\[\[[^\]]*\|([^\]]*)\]\]/g, "$1");
  s = s.replace(/\[\[([^\]]*)\]\]/g, "$1");
  // Remove HTML tags
  s = s.replace(/<[^>]+>/g, " ");
  // Remove wiki bold/italic markers
  s = s.replace(/'{2,}/g, "");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Extract killed count from cleaned casualty text.
 * Wikipedia often presents competing estimates ("Per Iran: 1,060 killed...
 * Per HRANA: 1,190 killed") — we take the MAX, not the sum.
 * For compound patterns ("32 civilians and 1 soldier killed"), we add the parts.
 */
function extractKilled(text: string): number {
  if (!text) return 0;
  const clean = stripWikiMarkup(text);

  // Pattern 1: "N killed" or "N dead" or "N deaths" (number directly before keyword)
  // Take MAX of all matches (competing estimates, not additive)
  const directPattern = /(\d[\d,]*)\+?\s*(?:–\s*(\d[\d,]*)\+?\s*)?(?:killed|dead|deaths)/gi;
  let best = 0;
  let match;
  while ((match = directPattern.exec(clean)) !== null) {
    const n1 = parseInt((match[1] || "0").replace(/,/g, ""), 10);
    const n2 = match[2] ? parseInt(match[2].replace(/,/g, ""), 10) : 0;
    best = Math.max(best, n1, n2);
  }
  if (best > 0) return best;

  // Pattern 2: "N word(s) and N word(s) killed" (e.g. "32 civilians and 1 soldier killed")
  const compoundPattern =
    /(\d[\d,]*)\+?\s+\w[\w\s-]*?\s+and\s+(\d[\d,]*)\+?\s+\w[\w\s-]*?\s*killed/gi;
  while ((match = compoundPattern.exec(clean)) !== null) {
    const n1 = parseInt((match[1] || "0").replace(/,/g, ""), 10);
    const n2 = parseInt((match[2] || "0").replace(/,/g, ""), 10);
    best = Math.max(best, n1 + n2);
  }
  if (best > 0) return best;

  // Pattern 3: "N [up to 2 words] killed" (loose match — kept tight to avoid false matches)
  const loosePattern = /(\d[\d,]*)\+?\s+(?:\w+\s+){0,2}killed/gi;
  while ((match = loosePattern.exec(clean)) !== null) {
    best = Math.max(best, parseInt((match[1] || "0").replace(/,/g, ""), 10));
  }

  return best;
}

function extractInjured(text: string): number {
  if (!text) return 0;
  const clean = stripWikiMarkup(text);
  const injuredPattern = /(\d[\d,]*)\+?\s*(?:–\s*(\d[\d,]*)\+?\s*)?(?:injured|wounded)/gi;
  let total = 0;
  let match;
  while ((match = injuredPattern.exec(clean)) !== null) {
    const n1 = parseInt((match[1] || "0").replace(/,/g, ""), 10);
    const n2 = match[2] ? parseInt(match[2].replace(/,/g, ""), 10) : 0;
    total += Math.max(n1, n2);
  }
  return total;
}

function extractMilitary(text: string): number {
  if (!text) return 0;
  const clean = stripWikiMarkup(text);
  // "N soldiers killed" or "N military personnel killed"
  const milKilledPattern =
    /(\d[\d,]*)\+?\s*(?:soldiers?|military\s*personnel|military|combatants?|troops?|personnel|servicemen|fighters?)\s*(?:killed|dead)/gi;
  let best = 0;
  let match;
  while ((match = milKilledPattern.exec(clean)) !== null) {
    best = Math.max(best, parseInt((match[1] || "0").replace(/,/g, ""), 10));
  }
  if (best > 0) return best;
  // Also handle parenthetical breakdowns: "killed (... N military personnel ...)"
  const breakdownPattern =
    /(\d[\d,]*)\+?\s*(?:soldiers?|military\s*personnel|military|combatants?|troops?|personnel|servicemen|fighters?)/gi;
  while ((match = breakdownPattern.exec(clean)) !== null) {
    best = Math.max(best, parseInt((match[1] || "0").replace(/,/g, ""), 10));
  }
  return best;
}

function extractCivilian(text: string): number {
  if (!text) return 0;
  const clean = stripWikiMarkup(text);
  // "N civilians killed"
  const civKilledPattern = /(\d[\d,]*)\+?\s*(?:civilians?|non-combatants?)\s*(?:killed|dead)/gi;
  let best = 0;
  let match;
  while ((match = civKilledPattern.exec(clean)) !== null) {
    best = Math.max(best, parseInt((match[1] || "0").replace(/,/g, ""), 10));
  }
  if (best > 0) return best;
  // Also handle parenthetical breakdowns: "killed (N civilians, ...)"
  const breakdownPattern = /(\d[\d,]*)\+?\s*(?:civilians?|non-combatants?)/gi;
  while ((match = breakdownPattern.exec(clean)) !== null) {
    best = Math.max(best, parseInt((match[1] || "0").replace(/,/g, ""), 10));
  }
  return best;
}

/**
 * Parse wikitext infobox fields for casualty data.
 * Looks for `| casualties1 = ...`, `| casualties2 = ...`, etc.
 */
function parseInfoboxCasualties(wikitext: string): CasualtyData {
  const result: CasualtyData = {
    iran: { killed: 0, injured: 0, military: 0, civilian: 0 },
    usIsrael: { killed: 0, injured: 0, military: 0, civilian: 0 },
    lastUpdated: new Date().toISOString(),
    source: "wikipedia",
    articles: [],
  };

  // Extract combatant labels to determine which side is casualties1 vs casualties2
  // combatant1 is typically Israel/US, combatant2 is typically Iran
  // Use {{flag|Iran}} template match to avoid false positives from footnotes
  // that mention "Iranian nuclear sites" etc.
  const combatant1Match = wikitext.match(/\|\s*combatant1\s*=\s*([\s\S]*?)(?:\n\s*\|)/);
  const combatant2Match = wikitext.match(/\|\s*combatant2\s*=\s*([\s\S]*?)(?:\n\s*\|)/);
  const combatant1Raw = combatant1Match?.[1] || "";
  const combatant2Raw = combatant2Match?.[1] || "";

  // Check for {{flag|Iran}} or {{flag|Islamic Republic of Iran|...}} template
  const iranFlagPattern = /\{\{flag\|(?:Islamic Republic of )?Iran/i;
  const israelFlagPattern = /\{\{flag\|Israel\}\}/i;
  const iranIsCasualties1 = iranFlagPattern.test(combatant1Raw);
  const iranIsCasualties2 = iranFlagPattern.test(combatant2Raw);
  const israelIsCasualties1 = israelFlagPattern.test(combatant1Raw);
  const israelIsCasualties2 = israelFlagPattern.test(combatant2Raw);

  // Extract casualties fields by splitting on `| casualtiesN =` boundaries.
  // The boundary may appear mid-line (after {{Endplainlist}} or comments),
  // so we split on the `| casualties` pattern itself and pair keys with values.
  const casualtyFields: Record<string, string> = {};
  const splitPattern = /\|\s*(casualties\d?)\s*=\s*/gi;
  const fieldKeys: string[] = [];
  const fieldPositions: number[] = [];
  let match;
  while ((match = splitPattern.exec(wikitext)) !== null) {
    fieldKeys.push(match[1].toLowerCase().trim());
    fieldPositions.push(match.index + match[0].length);
  }
  for (let i = 0; i < fieldKeys.length; i++) {
    const start = fieldPositions[i];
    // End at the next casualties field, or at the next top-level infobox field `| word =`
    let end = wikitext.length;
    if (i + 1 < fieldPositions.length) {
      // Go back to the `|` before the next casualties field
      const nextFieldMatch = wikitext.lastIndexOf("|", fieldPositions[i + 1]);
      end = nextFieldMatch > start ? nextFieldMatch : fieldPositions[i + 1];
    } else {
      // Last field — find next `| word =` or `}}`
      const afterPattern = /\|\s*[a-z_]+\s*=/g;
      afterPattern.lastIndex = start;
      const afterMatch = afterPattern.exec(wikitext);
      if (afterMatch) end = afterMatch.index;
    }
    casualtyFields[fieldKeys[i]] = wikitext.slice(start, end).trim();
  }

  // Parse each casualty field
  for (const [key, text] of Object.entries(casualtyFields)) {
    const killed = extractKilled(text);
    const injured = extractInjured(text);
    const military = extractMilitary(text);
    const civilian = extractCivilian(text);

    let side: "iran" | "usIsrael" | null = null;

    // Primary: use combatant mapping (casualties1 = combatant1's casualties, etc.)
    // This is reliable because Wikipedia infoboxes are structured consistently.
    if (key === "casualties1" || key === "casualties") {
      side = iranIsCasualties1 ? "iran" : israelIsCasualties1 ? "usIsrael" : "usIsrael";
    } else if (key === "casualties2") {
      side = iranIsCasualties2 ? "iran" : israelIsCasualties2 ? "usIsrael" : "iran";
    } else if (key === "casualties3") {
      // Third-party / summary field — skip to avoid double-counting
      continue;
    }

    // Fallback: if combatant mapping was inconclusive, check stripped text
    // (strip refs/templates first to avoid false matches from citation titles)
    if (!side) {
      const cleanLower = stripWikiMarkup(text).toLowerCase();
      if (
        cleanLower.includes("iran") ||
        cleanLower.includes("irgc") ||
        cleanLower.includes("persian")
      ) {
        side = "iran";
      } else if (
        cleanLower.includes("israel") ||
        cleanLower.includes("idf") ||
        cleanLower.includes("united states") ||
        cleanLower.includes("american")
      ) {
        side = "usIsrael";
      }
    }

    if (!side) continue;

    // Take the max value (in case multiple articles provide data)
    if (killed > result[side].killed) result[side].killed = killed;
    if (injured > result[side].injured) result[side].injured = injured;
    if (military > result[side].military) result[side].military = military;
    if (civilian > result[side].civilian) result[side].civilian = civilian;
  }

  // Derive civilian count when Wikipedia doesn't break it down explicitly
  // (e.g. "12 people killed" + "6 military killed" → 6 civilian)
  for (const side of ["iran", "usIsrael"] as const) {
    const s = result[side];
    if (s.civilian === 0 && s.killed > 0 && s.military > 0 && s.killed > s.military) {
      s.civilian = s.killed - s.military;
    }
  }

  return result;
}

// Manual overrides — applied on top of Wikipedia-scraped data
const MANUAL_OVERRIDES: Partial<Record<"iran" | "usIsrael", Partial<SideCasualties>>> = {
  usIsrael: { military: 106 },
};

function applyOverrides(data: CasualtyData): CasualtyData {
  for (const [side, overrides] of Object.entries(MANUAL_OVERRIDES) as [
    keyof typeof MANUAL_OVERRIDES,
    Partial<SideCasualties>,
  ][]) {
    if (!side || !overrides) continue;
    for (const [field, value] of Object.entries(overrides) as [keyof SideCasualties, number][]) {
      if (value !== undefined) {
        data[side][field] = value;
      }
    }
  }
  // Recompute killed if military+civilian override exceeds it
  for (const side of ["iran", "usIsrael"] as const) {
    const s = data[side];
    if (s.military + s.civilian > s.killed) {
      s.killed = s.military + s.civilian;
    }
  }
  return data;
}

async function fetchFromWikipedia(): Promise<CasualtyData> {
  const results = await Promise.allSettled(
    WIKIPEDIA_ARTICLES.map(async (article, idx) => {
      const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${article}&prop=wikitext&format=json&section=0&redirects=true`;
      const res = await fetch(url, {
        headers: { "User-Agent": "StrikeMap/1.0 (https://strikemap.live; contact@strikemap.live)" },
        next: { revalidate: 300 },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const wikitext = data?.parse?.wikitext?.["*"] || "";
      return { wikitext, article: ARTICLE_DISPLAY_NAMES[idx] };
    })
  );

  const combined: CasualtyData = {
    iran: { killed: 0, injured: 0, military: 0, civilian: 0 },
    usIsrael: { killed: 0, injured: 0, military: 0, civilian: 0 },
    lastUpdated: new Date().toISOString(),
    source: "wikipedia",
    articles: [],
  };

  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const { wikitext, article } = r.value;
    if (!wikitext) continue;

    combined.articles.push(article);
    const parsed = parseInfoboxCasualties(wikitext);

    // Take the max from any article for each field
    for (const side of ["iran", "usIsrael"] as const) {
      for (const field of ["killed", "injured", "military", "civilian"] as const) {
        if (parsed[side][field] > combined[side][field]) {
          combined[side][field] = parsed[side][field];
        }
      }
    }
  }

  return combined;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "1";

    // Check Redis cache first (skip if force refresh)
    const redis = getRedis();
    if (redis && !forceRefresh) {
      const cached = await redis.get(REDIS_WIKIPEDIA_CASUALTIES_KEY);
      if (cached) {
        const data = applyOverrides(typeof cached === "string" ? JSON.parse(cached) : cached);
        return NextResponse.json(data, {
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          },
        });
      }
    }

    // Fetch fresh data from Wikipedia, then apply manual overrides
    const data = applyOverrides(await fetchFromWikipedia());

    // Cache in Redis
    if (redis) {
      await redis.set(REDIS_WIKIPEDIA_CASUALTIES_KEY, JSON.stringify(data), {
        ex: WIKIPEDIA_CASUALTIES_TTL_S,
      });
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("Failed to fetch Wikipedia casualties:", err);
    return NextResponse.json({ error: "Failed to fetch casualty data" }, { status: 500 });
  }
}
