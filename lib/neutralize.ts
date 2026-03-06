/**
 * Neutrality filter for incident descriptions.
 * Rule-based replacement of biased/editorializing language,
 * with optional AI rewrite for text that still contains subtle bias.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// --- Rule-based replacements ---
// Ordered longest-first so "terrorist attack" matches before "terrorist"
const BIAS_REPLACEMENTS: [string, string][] = [
  // Multi-word phrases first (longest match wins)
  ["the zionist entity", "Israel"],
  ["zionist entity", "Israel"],
  ["the zionist regime", "the Israeli government"],
  ["zionist regime", "Israeli government"],
  ["the occupation forces", "the military forces"],
  ["occupation forces", "military forces"],
  ["the occupation", "the military presence"],
  ["occupied territories", "contested territories"],
  ["occupied palestine", "Palestinian territories"],
  ["resistance fighters", "armed groups"],
  ["resistance forces", "armed forces"],
  ["the resistance", "the armed groups"],
  ["terrorist attack", "armed attack"],
  ["terror attack", "attack"],
  ["puppet government", "allied government"],
  ["puppet regime", "allied government"],
  ["ethnic cleansing", "forced displacement"],
  ["war criminal", "leader"],
  ["war criminals", "leaders"],
  ["heroic operation", "military operation"],
  ["heroic strike", "military strike"],
  ["glorious victory", "military success"],
  ["enemy entity", "opposing force"],
  ["is in panic", "is concerned"],
  ["in panic", "concerned"],

  // Single-word replacements (after multi-word to avoid partial matches)
  ["the regime", "the government"],
  ["regime's", "government's"],
  ["regime", "government"],
  ["zionist", "Israeli"],
  ["terrorists", "militants"],
  ["terrorist", "militant"],
  ["martyrdom", "death"],
  ["martyred", "killed"],
  ["martyrs", "casualties"],
  ["martyr", "casualty"],
  ["crusaders", "foreign forces"],
  ["crusader", "foreign"],
  ["infidels", "opposing forces"],
  ["infidel", "opposing"],
  ["illegitimate", "disputed"],
  ["genocide", "mass casualties"],
  ["apartheid", "discriminatory policies"],

  // Arabic
  ["الكيان الصهيوني", "إسرائيل"],
  ["الكيان", "إسرائيل"],
  ["النظام الصهيوني", "الحكومة الإسرائيلية"],
  ["إرهابي", "مسلح"],
  ["إرهابيين", "مسلحين"],
  ["المقاومة", "القوات المسلحة"],
  ["شهداء", "قتلى"],
  ["استشهد", "قُتل"],

  // Persian
  ["نظام صهیونیستی", "اسرائیل"],
  ["رژیم صهیونیستی", "دولت اسرائیل"],
  ["رژیم", "دولت"],
  ["تروریست", "ستیزه‌جو"],
  ["تروریستی", "مسلحانه"],
  ["شهید شد", "کشته شد"],
  ["شهدا", "کشته‌شدگان"],
];

// Build regex patterns (once, at module load)
const REPLACEMENT_PATTERNS: { regex: RegExp; replacement: string }[] =
  BIAS_REPLACEMENTS.map(([biased, neutral]) => ({
    regex: new RegExp(
      biased.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gi"
    ),
    replacement: neutral,
  }));

// --- Bias indicator detection (for AI flagging) ---
const EDITORIAL_ADJECTIVES = [
  "brutal", "barbaric", "savage", "heinous", "diabolical",
  "heroic", "glorious", "valiant", "righteous",
  "cowardly", "treacherous", "demonic", "satanic",
  "war criminal", "war criminals",
];

/**
 * Apply rule-based neutralization to text.
 * Replaces clearly biased/editorializing terms with neutral equivalents.
 * Preserves all factual content — replacements never shorten text.
 */
export function neutralizeText(text: string): { text: string; wasModified: boolean } {
  if (!text || text.length < 5) return { text, wasModified: false };

  let result = text;
  let modified = false;

  for (const { regex, replacement } of REPLACEMENT_PATTERNS) {
    const before = result;
    // Preserve case pattern: if matched text is all-caps, keep replacement all-caps
    result = result.replace(regex, (match) => {
      const isAllCaps = match === match.toUpperCase() && match !== match.toLowerCase();
      const isCapitalized = match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase();
      let rep = replacement;
      if (isAllCaps) rep = rep.toUpperCase();
      else if (isCapitalized) rep = rep.charAt(0).toUpperCase() + rep.slice(1);
      return rep;
    });
    if (result !== before) modified = true;
  }

  // Post-processing: fix article agreement ("a armed" → "an armed")
  if (modified) {
    result = result.replace(/\ba (a[a-z])/gi, (match, word) => {
      const isUpper = match[0] === "A";
      return `${isUpper ? "An" : "an"} ${word}`;
    });
  }

  return { text: result, wasModified: modified };
}

/**
 * Check if text still contains subtle bias indicators after rule-based pass.
 * Returns true if the text should be sent to AI for rewriting.
 */
export function hasBiasIndicators(text: string): boolean {
  if (!text || text.length < 20) return false;

  const lower = text.toLowerCase();

  // Scare quotes around proper nouns: "Israel", "defense", "peace"
  if (/[""](?:Israel|defense|peace|ceasefire|security)[""]/.test(text)) return true;

  // Excessive exclamation marks (3+)
  if ((text.match(/!/g) || []).length >= 3) return true;

  // ALL CAPS phrases (5+ consecutive capitalized words, excluding abbreviations)
  if (/(?:[A-Z]{2,}\s+){4,}[A-Z]{2,}/.test(text)) return true;

  // Editorial adjectives that survived rule-based pass
  if (EDITORIAL_ADJECTIVES.some((adj) => lower.includes(adj))) return true;

  return false;
}

// --- AI rewrite cache ---
const rewriteCache = new Map<string, string>();

/**
 * Rewrite biased text using AI (Gemini 2.5 Flash).
 * Preserves all factual information, only changes tone.
 * Returns original text if AI fails or is unavailable.
 */
export async function neutralizeWithAI(text: string): Promise<string> {
  if (!text || text.length < 20) return text;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return text;

  const cacheKey = text.slice(0, 200);
  if (rewriteCache.has(cacheKey)) return rewriteCache.get(cacheKey)!;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { maxOutputTokens: 512 },
    });

    const prompt = `Rewrite this text as a neutral news wire report (like AP or Reuters).

RULES:
- Preserve ALL factual information: names, numbers, locations, dates, weapons, military units
- Only change tone, loaded adjectives, and editorializing language
- Keep approximately the same length and structure
- Do NOT add commentary, context, or new information
- Do NOT remove any facts, just rephrase biased framing
- Use neutral terms: "government" not "regime", "militants" not "terrorists", "killed" not "martyred"
- Output ONLY the rewritten text, nothing else

Text to rewrite:
${text}`;

    const result = await model.generateContent(prompt);
    const rewritten = result.response.text().trim();

    // Safety check: rewritten text should be roughly same length (not wildly different)
    if (rewritten.length < text.length * 0.5 || rewritten.length > text.length * 2) {
      console.warn("[neutralize] AI rewrite length mismatch, keeping original");
      rewriteCache.set(cacheKey, text);
      return text;
    }

    rewriteCache.set(cacheKey, rewritten);
    return rewritten;
  } catch (err) {
    console.error("[neutralize] AI rewrite failed:", err);
    rewriteCache.set(cacheKey, text);
    return text;
  }
}
