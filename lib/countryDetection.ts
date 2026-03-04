/**
 * Keyword-based country detection from incident location strings.
 * Maps location text to ISO country names matching the GeoJSON boundaries.
 */

const COUNTRY_KEYWORDS: Record<string, string[]> = {
  "Yemen": [
    "yemen", "sana'a", "sanaa", "aden", "hodeidah", "hodeida", "hudaydah",
    "marib", "taiz", "saada", "sa'ada", "hajjah", "al bayda", "shabwah",
    "hadramaut", "socotra", "houthi", "ansar allah",
  ],
  "Syria": [
    "syria", "damascus", "aleppo", "homs", "latakia", "tartus", "idlib",
    "deir ez-zor", "deir ezzor", "raqqa", "hasaka", "qamishli", "daraa",
    "golan", "palmyra", "tadmur", "abu kamal", "al-bukamal",
  ],
  "Lebanon": [
    "lebanon", "beirut", "tripoli", "sidon", "tyre", "nabatiyeh", "baalbek",
    "bekaa", "hezbollah", "dahiyeh", "jounieh", "zahle",
  ],
  "Iraq": [
    "iraq", "baghdad", "basra", "mosul", "erbil", "kirkuk", "najaf",
    "karbala", "sulaymaniyah", "tikrit", "fallujah", "ramadi", "samarra",
    "ain al-asad", "al-asad", "qaim",
  ],
  "United Arab Emirates": [
    "uae", "emirates", "dubai", "abu dhabi", "sharjah", "al dhafra",
    "fujairah", "ras al khaimah", "ajman",
  ],
  "Saudi Arabia": [
    "saudi", "riyadh", "jeddah", "mecca", "medina", "dhahran", "dammam",
    "khobar", "abha", "jizan", "najran", "tabuk", "yanbu", "aramco",
    "neom",
  ],
  "Jordan": [
    "jordan", "amman", "aqaba", "zarqa", "irbid", "mafraq", "tower 22",
  ],
  "Qatar": [
    "qatar", "doha", "al udeid",
  ],
  "Bahrain": [
    "bahrain", "manama", "isa air base",
  ],
  "Kuwait": [
    "kuwait", "ali al salem", "bubiyan",
  ],
  "Turkey": [
    "turkey", "türkiye", "ankara", "istanbul", "incirlik", "adana",
    "diyarbakir", "batman", "gaziantep",
  ],
  "Oman": [
    "oman", "muscat", "salalah", "duqm", "masirah",
  ],
  "Pakistan": [
    "pakistan", "islamabad", "karachi", "lahore", "balochistan", "quetta",
    "peshawar", "rawalpindi",
  ],
  "Afghanistan": [
    "afghanistan", "kabul", "kandahar", "herat", "mazar", "jalalabad",
  ],
};

/**
 * Detect country name from an incident location string.
 * Returns the country name matching the GeoJSON feature properties, or null.
 */
export function detectCountry(location: string): string | null {
  if (!location) return null;
  const lower = location.toLowerCase();

  for (const [country, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return country;
    }
  }

  return null;
}

/** Countries that should NOT trigger the territory flash */
const EXCLUDED_COUNTRIES = new Set(["Iran", "Israel"]);

/**
 * Check if a country should trigger the territory flash effect.
 */
export function shouldFlashCountry(country: string | null): boolean {
  if (!country) return false;
  return !EXCLUDED_COUNTRIES.has(country);
}
