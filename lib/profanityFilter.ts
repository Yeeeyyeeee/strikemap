// Blocked words — checked against nicknames and message text.
// Matches are case-insensitive and resist common letter substitutions.

const BLOCKED_WORDS = [
  // Racial slurs (+ misspelling variants)
  "nigga", "nigg", "nig", "niga", "nigr", "negro", "nigar",
  "nigl", "nikk", "niqq", "negr", "neger", "nugga", "niglet",
  "nigler", "niger",
  "chink", "gook", "spic", "spik", "wetback", "kike",
  "coon", "darkie", "raghead", "towelhead", "beaner",
  "cracker",
  // Nazi / hate
  "nazi", "hitler", "hitlr", "htlr", "heil", "sieg",
  "swastika", "fuhrer", "fhrer",
  "aryan", "skinhead", "neonazi",
  "holocaust", "auschwitz",
  // Slurs
  "fag", "faggot", "fagot", "tranny", "retard", "retrd",
  // Terrorism glorification
  "isis", "alqaeda", "jihadi",
  // Extreme profanity (+ misspelling variants)
  "fuck", "fck", "fuk", "fuq", "phuk", "phuck",
  "shit", "sht",
  "cunt", "cnt", "kunt",
  "bitch", "btch", "biatch",
  "whore", "slut",
  "dick", "dik", "cock", "kok",
  "penis", "penits", "penus", "penos", "peenis", "pnis", "penit",
  "rape", "rapist",
  "asshole", "arsehole",
  // Death / violence threats
  "killall", "genocide", "ethnic cleansing",
];

// Common letter substitutions people use to bypass filters
const SUBSTITUTIONS: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  "$": "s",
  "!": "i",
  "+": "t",
  "¡": "i",
};

/** Collapse consecutive duplicate characters: "nigggg" → "nig", "fuuuck" → "fuck" */
function dedup(s: string): string {
  return s.replace(/(.)\1+/g, "$1");
}

/** Normalize text: lowercase, strip spaces/special chars, apply leet-speak substitutions */
function normalize(input: string): string {
  let s = input.toLowerCase();
  // Apply substitutions
  for (const [from, to] of Object.entries(SUBSTITUTIONS)) {
    s = s.split(from).join(to);
  }
  // Remove non-alphanumeric (keep letters only for matching)
  s = s.replace(/[^a-z]/g, "");
  return s;
}

/** Check if text contains any blocked words. Returns the matched word or null. */
export function containsProfanity(text: string): string | null {
  const normalized = normalize(text);
  const deduped = dedup(normalized);
  for (const word of BLOCKED_WORDS) {
    // Check both the normalized form and the deduped form
    if (normalized.includes(word) || deduped.includes(word)) return word;
  }
  return null;
}

/** Check if a nickname (4-letter part) is offensive */
export function isOffensiveNickname(nickname: string): boolean {
  // Check the full nickname
  if (containsProfanity(nickname)) return true;
  // Also check just the letters part (before the dash)
  const letterPart = nickname.split("-")[0] || "";
  if (containsProfanity(letterPart)) return true;
  return false;
}
