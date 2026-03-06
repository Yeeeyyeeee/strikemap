import { GoogleGenerativeAI, type ResponseSchema, SchemaType } from "@google/generative-ai";
import { GEOCODE_LAT_MIN, GEOCODE_LAT_MAX, GEOCODE_LNG_MIN, GEOCODE_LNG_MAX } from "./constants";

export interface EnrichmentResult {
  location: string;
  lat: number;
  lng: number;
  weapon: string;
  target_type: string;
  side: "iran" | "us_israel" | "us" | "israel";
  target_military: boolean;
  intercepted_by: string;
  intercept_success: boolean | null;
  missiles_fired?: number;
  missiles_intercepted?: number;
  damage_assessment: string;
  damage_severity: string;
  casualties_military: number;
  casualties_civilian: number;
  casualties_description: string;
  isStatement?: boolean;
}

// ---- In-memory cache (survives within a warm serverless instance) ----
const cache: Map<string, EnrichmentResult | null> = new Map();

const responseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    location: { type: SchemaType.STRING, description: "City/landmark with country, e.g. 'Natanz, Iran'" },
    lat: { type: SchemaType.NUMBER, description: "Latitude as decimal" },
    lng: { type: SchemaType.NUMBER, description: "Longitude as decimal" },
    weapon: { type: SchemaType.STRING, description: "Weapon type if mentioned" },
    target_type: { type: SchemaType.STRING, description: "What was targeted" },
    side: { type: SchemaType.STRING, description: "iran, us, or israel — use 'us' for US/American/CENTCOM strikes, 'israel' for Israeli/IDF strikes" },
    target_military: { type: SchemaType.BOOLEAN, description: "true if military target" },
    intercepted_by: { type: SchemaType.STRING, description: "Defense system that intercepted, e.g. 'Iron Dome', 'Arrow-3', 'THAAD', 'David\\'s Sling', or empty string if not intercepted/unknown" },
    intercept_success: { type: SchemaType.BOOLEAN, description: "true if the projectile was confirmed intercepted by a defense system, false otherwise" },
    damage_assessment: { type: SchemaType.STRING, description: "Brief 1-2 sentence damage assessment describing physical destruction, casualties if known, and strategic impact" },
    damage_severity: { type: SchemaType.STRING, description: "One of: minor, moderate, severe, catastrophic" },
    casualties_description: { type: SchemaType.STRING, description: "Brief description of casualties: who was killed/injured, unit affiliation if known. Use 'No casualties reported' if unknown." },
  },
  required: ["location", "lat", "lng", "weapon", "target_type", "side", "target_military", "intercepted_by", "intercept_success", "damage_assessment", "damage_severity", "casualties_description"],
};

const SYSTEM_PROMPT = `You are a military intelligence analyst. Extract structured information from this Telegram/news post about military strikes involving Iran.

Return a JSON object with:
- location: City/landmark name with country (e.g. "Dubai, UAE", "Natanz, Iran")
- lat: Latitude as decimal number
- lng: Longitude as decimal number
- weapon: Weapon type if mentioned (e.g. "Ballistic missile", "Shahed-136 drone", "Airstrike")
- target_type: What was targeted (e.g. "Air base", "Urban area", "Oil refinery")
- side: Who is attacking — "iran" if Iran/IRGC/Houthis/Hezbollah attacking, "us" if US/American/CENTCOM/Pentagon attacking, "israel" if Israel/IDF/IAF/Mossad attacking
- target_military: true if military target, false if civilian
- intercepted_by: Name of the defense system that intercepted the projectile (e.g. "Iron Dome", "Arrow-3", "THAAD", "David's Sling"). Empty string if not intercepted or not mentioned.
- intercept_success: true if the projectile was confirmed intercepted, false otherwise
- damage_assessment: Brief (1-2 sentence) damage assessment. Describe physical destruction, casualties if known, and strategic impact. If unknown, write "Damage assessment pending".
- damage_severity: Rate as "minor" (limited damage, no casualties), "moderate" (significant damage, few casualties), "severe" (major destruction, multiple casualties), or "catastrophic" (massive destruction, mass casualties)
- casualties_description: Brief description of casualties — who was killed/injured, unit affiliation if known. If unknown, write "No casualties reported". Do NOT include specific numbers.

If the post is not about a specific strike or you cannot determine the location, set lat and lng to 0.

IMPORTANT — NEUTRALITY RULES:
- Use strictly neutral, factual language in ALL output fields.
- NEVER use politically charged terms like "regime", "terror", "terrorist", "occupied", "Zionist", "apartheid", "entity", "resistance", or "liberation".
- Use neutral alternatives: "government" instead of "regime", "forces" instead of "militants", "Israeli" instead of "Zionist".
- For locations, use internationally recognized names only (e.g. "Tel Aviv, Israel" not "occupied Palestine").
- The damage_assessment and casualties_description should read like a neutral news wire report, not an editorial.`;

export async function enrichPostWithAI(text: string): Promise<EnrichmentResult | null> {
  if (!text || text.length < 10) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const c = cache;
  const cacheKey = text.slice(0, 200);
  if (c.has(cacheKey)) {
    return c.get(cacheKey) ?? null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nPost:\n${text}`);
    const response = result.response;
    const jsonText = response.text();
    const parsed = JSON.parse(jsonText);

    // Validate the result
    if (!parsed.location || typeof parsed.lat !== "number" || typeof parsed.lng !== "number") {
      c.set(cacheKey, null);
      return null;
    }

    // Bounding box validation: reject coordinates outside Middle East region
    if (parsed.lat !== 0 && parsed.lng !== 0) {
      if (parsed.lat < GEOCODE_LAT_MIN || parsed.lat > GEOCODE_LAT_MAX ||
          parsed.lng < GEOCODE_LNG_MIN || parsed.lng > GEOCODE_LNG_MAX) {
        console.warn(`[geocode] AI returned out-of-bounds coordinates (${parsed.lat}, ${parsed.lng}) for "${parsed.location}" — rejecting`);
        c.set(cacheKey, null);
        return null;
      }
    }

    // Normalize side value
    if (parsed.side === "us_israel") {
      // Legacy value — split based on location heuristic
      parsed.side = parsed.location?.includes("Iran") ? "us" : "israel";
    }
    if (parsed.side !== "iran" && parsed.side !== "us" && parsed.side !== "israel") {
      parsed.side = "iran";
    }

    const validSeverities = ["minor", "moderate", "severe", "catastrophic"];

    const enrichment: EnrichmentResult = {
      location: parsed.location,
      lat: parsed.lat,
      lng: parsed.lng,
      weapon: parsed.weapon || "",
      target_type: parsed.target_type || "",
      side: parsed.side,
      target_military: !!parsed.target_military,
      intercepted_by: parsed.intercepted_by || "",
      intercept_success: !!parsed.intercept_success,
      damage_assessment: parsed.damage_assessment || "Damage assessment pending",
      damage_severity: validSeverities.includes(parsed.damage_severity) ? parsed.damage_severity : "minor",
      casualties_military: 0, // Always 0 — real casualty data sourced from Wikipedia via /api/casualties
      casualties_civilian: 0, // Always 0 — real casualty data sourced from Wikipedia via /api/casualties
      casualties_description: parsed.casualties_description || "No casualties reported",
    };

    c.set(cacheKey, enrichment);
    return enrichment;
  } catch (err) {
    console.error("Gemini enrichment failed:", err);
    c.set(cacheKey, null);
    return null;
  }
}

/**
 * Process an array of items through AI enrichment in batches to avoid rate limits.
 */
export async function enrichBatch<T>(
  items: T[],
  getText: (item: T) => string,
  batchSize = 5,
): Promise<(EnrichmentResult | null)[]> {
  const results: (EnrichmentResult | null)[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((item) => enrichPostWithAI(getText(item)))
    );
    for (const r of batchResults) {
      results.push(r.status === "fulfilled" ? r.value : null);
    }
  }

  return results;
}
