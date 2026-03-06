#!/usr/bin/env npx tsx
/**
 * Interactive test harness for the data reliability pipeline.
 * Feed custom news lines and see exactly how the pipeline processes them.
 *
 * Usage:
 *   npx tsx scripts/test-pipeline.ts "Airstrike on Beirut after attacks from Tehran"
 *   npx tsx scripts/test-pipeline.ts --dedup "airstrike in central Israel" "airstrike in Tel Aviv"
 *   npx tsx scripts/test-pipeline.ts --siren "Sirens sounding NOW in Tehran"
 *   npx tsx scripts/test-pipeline.ts --filter "Putin comments on Iran strike"
 *   npx tsx scripts/test-pipeline.ts --neutralize "The regime launched a terrorist attack"
 */

import { enrichWithKeywords, matchBestLocation } from "../lib/keywordEnricher";
import { dedupScore } from "../lib/incidentStore";
import { isIranRelated } from "../lib/telegram";
import { neutralizeText, hasBiasIndicators } from "../lib/neutralize";
import { hasSirenKeywords } from "../lib/sirenDetector";
import {
  DEDUP_SCORE_THRESHOLD,
  GEOCODE_LAT_MIN, GEOCODE_LAT_MAX,
  GEOCODE_LNG_MIN, GEOCODE_LNG_MAX,
} from "../lib/constants";
import { haversineKm } from "../lib/geo";
import type { Incident } from "../lib/types";

// Colors for terminal output
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function makeTestIncident(text: string, overrides?: Partial<Incident>): Incident {
  const result = enrichWithKeywords(text);
  return {
    id: `test-${Date.now()}`,
    date: "2026-03-05",
    timestamp: new Date().toISOString(),
    location: result?.location || "",
    lat: result?.lat || 0,
    lng: result?.lng || 0,
    description: text.slice(0, 300),
    details: text,
    weapon: result?.weapon || "",
    target_type: result?.target_type || "",
    video_url: "",
    source_url: "",
    source: "telegram",
    side: result?.side || "iran",
    target_military: result?.target_military || false,
    confidence: "unconfirmed",
    sourceCount: 1,
    ...overrides,
  };
}

// ---- ENRICHMENT MODE (default) ----
function runEnrichment(text: string) {
  console.log(`\n${BOLD}INPUT:${RESET} "${text}"\n`);

  const result = enrichWithKeywords(text);

  if (!result) {
    console.log(`${RED}ENRICHMENT RESULT: null${RESET}`);
    console.log(`${DIM}(No strike indicators detected, or insufficient indicators, or no location found)${RESET}`);
    return;
  }

  console.log(`${BOLD}ENRICHMENT RESULT:${RESET}`);
  console.log(`  Location:     ${GREEN}${result.location}${RESET}`);
  console.log(`  Coordinates:  ${result.lat.toFixed(3)}, ${result.lng.toFixed(3)}`);
  console.log(`  Side:         ${CYAN}${result.side}${RESET}`);
  console.log(`  Weapon:       ${result.weapon || "(none)"}`);
  console.log(`  Casualties:   ${result.casualties_military} military, ${result.casualties_civilian} civilian`);
  console.log(`  Target type:  ${result.target_type}`);
  console.log(`  Military:     ${result.target_military}`);
  console.log(`  Is Statement: ${result.isStatement}`);
  if (result.intercepted_by) {
    console.log(`  Intercepted:  ${result.intercepted_by} (success: ${result.intercept_success})`);
  }

  // Geocode bounds check
  if (result.lat !== 0 && result.lng !== 0) {
    const inBounds = result.lat >= GEOCODE_LAT_MIN && result.lat <= GEOCODE_LAT_MAX &&
                     result.lng >= GEOCODE_LNG_MIN && result.lng <= GEOCODE_LNG_MAX;
    console.log(`  In bounds:    ${inBounds ? GREEN + "yes" : RED + "NO — OUT OF BOUNDS"}${RESET}`);
  }

  // Show all location candidates
  // We need access to the LOCATIONS array — we'll use matchBestLocation indirectly
  console.log(`\n${DIM}(Use matchBestLocation for detailed candidate ranking)${RESET}`);
}

// ---- DEDUP MODE ----
function runDedup(textA: string, textB: string) {
  console.log(`\n${BOLD}DEDUP COMPARISON${RESET}\n`);

  const now = new Date();
  const incA = makeTestIncident(textA, { timestamp: now.toISOString() });
  const incB = makeTestIncident(textB, {
    timestamp: new Date(now.getTime() + 60_000).toISOString(),
    id: `test-${Date.now()}-b`,
  });

  console.log(`INCIDENT A: "${textA}"`);
  console.log(`  → ${incA.location || "(no location)"} (${incA.lat.toFixed(2)}, ${incA.lng.toFixed(2)})`);
  console.log(`INCIDENT B: "${textB}"`);
  console.log(`  → ${incB.location || "(no location)"} (${incB.lat.toFixed(2)}, ${incB.lng.toFixed(2)})`);

  if (incA.lat === 0 && incB.lat === 0) {
    console.log(`\n${RED}Both incidents have no coordinates — cannot compute spatial dedup${RESET}`);
    return;
  }

  const score = dedupScore(incB, incA);
  const dist = haversineKm(incA.lat, incA.lng, incB.lat, incB.lng);
  const wouldMerge = score >= DEDUP_SCORE_THRESHOLD;

  console.log(`\n${BOLD}DEDUP SCORE: ${wouldMerge ? GREEN : RED}${score.toFixed(2)}${RESET} (threshold: ${DEDUP_SCORE_THRESHOLD}) → ${wouldMerge ? GREEN + "MERGE" : RED + "KEEP SEPARATE"}${RESET}`);
  console.log(`  Distance:   ${dist.toFixed(1)} km`);
  console.log(`  Time diff:  1 min (simulated)`);
  console.log(`  Weapons:    "${incA.weapon}" vs "${incB.weapon}"`);
  console.log(`  Sides:      ${incA.side} vs ${incB.side}`);

  if (wouldMerge && incA.location && incB.location) {
    // Which location would be kept?
    const aCommas = (incA.location.match(/,/g) || []).length;
    const bCommas = (incB.location.match(/,/g) || []).length;
    const kept = aCommas > bCommas ? incA.location : bCommas > aCommas ? incB.location :
      incA.location.length > incB.location.length ? incA.location : incB.location;
    console.log(`\n${BOLD}MERGE RESULT:${RESET} Keeps "${GREEN}${kept}${RESET}" (more specific)`);
  }
}

// ---- SIREN MODE ----
function runSiren(text: string) {
  console.log(`\n${BOLD}INPUT:${RESET} "${text}"\n`);

  const SIREN_KEYWORDS = [
    "siren", "sirens", "air raid", "air-raid",
    "air raid siren", "air defense siren", "civil defense siren",
    "warning siren", "alarm sounding", "alarms sounding",
    "sirens sounding", "sirens activated", "sirens heard",
    "sirens blaring", "sirens wailing",
    "take shelter", "seek shelter", "go to shelter", "bomb shelter",
    "shelter now", "shelter in place",
    "air alert", "air alarm",
    "under attack", "incoming missiles", "incoming rockets",
    "air defense activated", "warning systems activated",
    "صافرات الإنذار", "إنذار", "صافرة", "صفارات", "احتموا",
    "تحت الهجوم", "صواريخ قادمة", "دفاع جوي",
    "آژیر", "آژیر خطر", "پناهگاه",
    "siren sesleri",
  ];

  const URGENCY = [
    "now", "right now", "just now", "breaking", "urgent", "alert",
    "warning", "live", "happening", "ongoing", "currently", "immediately",
    "الآن", "عاجل", "فوری", "هم اکنون",
  ];

  const REPORTING = [
    "reported", "according to", "sources say", "reports say", "sources indicate",
    "media reports", "local media", "state media", "news agency",
    "confirmed that", "officials say", "witnesses say", "earlier today",
    "yesterday", "last night", "hours ago", "were heard",
  ];

  const lower = text.toLowerCase();
  const sirenHits = SIREN_KEYWORDS.filter((kw) => lower.includes(kw));
  const urgencyHits = URGENCY.filter((kw) => lower.includes(kw));
  const reportingHits = REPORTING.filter((kw) => lower.includes(kw));

  console.log(`  Siren keywords:     [${sirenHits.map(s => `"${s}"`).join(", ")}] (${sirenHits.length} match${sirenHits.length !== 1 ? "es" : ""})`);
  console.log(`  Urgency indicators: [${urgencyHits.map(s => `"${s}"`).join(", ")}] (${urgencyHits.length} match${urgencyHits.length !== 1 ? "es" : ""})`);
  console.log(`  Reporting context:  [${reportingHits.map(s => `"${s}"`).join(", ")}] (${reportingHits.length} match${reportingHits.length !== 1 ? "es" : ""})`);

  const triggered = hasSirenKeywords(text);
  console.log(`  ${BOLD}RESULT: ${triggered ? GREEN + "SIREN TRIGGERED" : RED + "BLOCKED"}${RESET}`);

  if (triggered) {
    const reason = sirenHits.length >= 2 ? `${sirenHits.length} keywords` :
      `1 keyword + urgency`;
    console.log(`  ${DIM}(${reason})${RESET}`);
  } else {
    const reason = sirenHits.length === 0 ? "no siren keywords" :
      reportingHits.length > 0 ? "reporting context requires 2+ keywords" :
      "single keyword without urgency";
    console.log(`  ${DIM}(${reason})${RESET}`);
  }
}

// ---- FILTER MODE ----
function runFilter(text: string) {
  console.log(`\n${BOLD}INPUT:${RESET} "${text}"\n`);

  const RU_KEYWORDS = [
    "ukraine", "ukrainian", "kyiv", "kiev", "kharkiv", "odesa", "odessa",
    "russia", "russian", "moscow", "kursk", "belgorod",
    "zelensky", "putin", "iskander", "kalibr", "kinzhal",
  ];

  const IRAN_KW = [
    "iran", "irgc", "iranian", "ballistic missile", "cruise missile",
    "shahed", "fateh", "emad", "tehran", "missile strike",
    "drone strike", "missile attack", "explosion", "strike",
    "airstrike", "attack", "intercept", "siren", "missile",
    "rocket", "drone", "israel", "idf", "hezbollah", "houthi",
    "centcom", "pentagon", "bahrain", "iraq", "syria", "yemen",
    "lebanon", "gaza", "tel aviv", "haifa", "isfahan", "bandar abbas",
  ];

  const HIGH_SPEC = [
    "tehran", "isfahan", "esfahan", "irgc", "shahed", "fateh", "fattah",
    "emad", "ghadr", "sejjil", "kharg island", "bandar abbas", "natanz",
    "fordow", "parchin", "bushehr", "tabriz", "shiraz", "qom", "mashhad",
    "bavar-373", "khordad", "islamic republic", "ayatollah",
    "hezbollah", "houthi", "ansar allah",
  ];

  const lower = text.toLowerCase();
  const ruHits = RU_KEYWORDS.filter((kw) => lower.includes(kw));
  const iranHits = IRAN_KW.filter((kw) => lower.includes(kw));
  const highSpecHits = HIGH_SPEC.filter((kw) => lower.includes(kw));

  console.log(`  Russia/Ukraine keywords: [${ruHits.map(s => `"${s}"`).join(", ")}] (${ruHits.length} match${ruHits.length !== 1 ? "es" : ""})`);
  console.log(`  Iran keywords:           [${iranHits.map(s => `"${s}"`).join(", ")}] (${iranHits.length} match${iranHits.length !== 1 ? "es" : ""})`);
  console.log(`  High-specificity:        [${highSpecHits.map(s => `"${s}"`).join(", ")}] (${highSpecHits.length} match${highSpecHits.length !== 1 ? "es" : ""})`);

  const allowed = isIranRelated(text);
  console.log(`  ${BOLD}RESULT: ${allowed ? GREEN + "ALLOWED" : RED + "BLOCKED"}${RESET}`);

  if (ruHits.length > 0) {
    if (highSpecHits.length > 0) {
      console.log(`  ${DIM}(High-specificity Iran keywords present → always pass)${RESET}`);
    } else if (iranHits.length === 0) {
      console.log(`  ${DIM}(No Iran keywords → blocked)${RESET}`);
    } else if (ruHits.length > iranHits.length * 2) {
      console.log(`  ${DIM}(Ratio: ${ruHits.length} RU vs ${iranHits.length} IR → Russia dominates)${RESET}`);
    } else {
      console.log(`  ${DIM}(Ratio: ${ruHits.length} RU vs ${iranHits.length} IR → Iran dominates or balanced)${RESET}`);
    }
  }
}

// ---- NEUTRALIZE MODE ----
function runNeutralize(text: string) {
  console.log(`\n${BOLD}INPUT:${RESET} "${text}"\n`);

  const { text: neutralized, wasModified } = neutralizeText(text);
  const flagged = hasBiasIndicators(neutralized);

  console.log(`${BOLD}RULE-BASED RESULT:${RESET}`);
  if (wasModified) {
    console.log(`  ${GREEN}Modified:${RESET} "${neutralized}"`);
  } else {
    console.log(`  ${DIM}No changes needed${RESET}`);
  }
  console.log(`  AI flag: ${flagged ? YELLOW + "FLAGGED for AI rewrite" : GREEN + "clean"}${RESET}`);

  if (wasModified) {
    // Show diff
    console.log(`\n${BOLD}CHANGES:${RESET}`);
    console.log(`  ${RED}- ${text}${RESET}`);
    console.log(`  ${GREEN}+ ${neutralized}${RESET}`);
  }
}

// ---- MAIN ----
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
${BOLD}Pipeline Test Harness${RESET}

Usage:
  npx tsx scripts/test-pipeline.ts "Your news line here"
  npx tsx scripts/test-pipeline.ts --dedup "Source 1 text" "Source 2 text"
  npx tsx scripts/test-pipeline.ts --siren "Sirens sounding NOW in Tehran"
  npx tsx scripts/test-pipeline.ts --filter "Putin comments on Iran strike"
  npx tsx scripts/test-pipeline.ts --neutralize "The regime launched a terrorist attack"

Modes:
  ${CYAN}(default)${RESET}     Enrichment — extract location, weapon, side, casualties
  ${CYAN}--dedup${RESET}       Compare two incidents for dedup scoring
  ${CYAN}--siren${RESET}       Test siren detection with false-positive filtering
  ${CYAN}--filter${RESET}      Test Russia/Ukraine content filter
  ${CYAN}--neutralize${RESET}  Test bias neutralization on text
`);
  process.exit(0);
}

const mode = args[0];

if (mode === "--dedup") {
  if (args.length < 3) {
    console.error("Usage: --dedup \"text A\" \"text B\"");
    process.exit(1);
  }
  runDedup(args[1], args[2]);
} else if (mode === "--siren") {
  if (args.length < 2) {
    console.error("Usage: --siren \"text\"");
    process.exit(1);
  }
  runSiren(args[1]);
} else if (mode === "--filter") {
  if (args.length < 2) {
    console.error("Usage: --filter \"text\"");
    process.exit(1);
  }
  runFilter(args[1]);
} else if (mode === "--neutralize") {
  if (args.length < 2) {
    console.error("Usage: --neutralize \"text\"");
    process.exit(1);
  }
  runNeutralize(args[1]);
} else {
  runEnrichment(mode);
}
