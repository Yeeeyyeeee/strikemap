import { EnrichmentResult } from "./geocodeWithAI";

/**
 * Rules-based enricher: extracts location, weapon, and side from text
 * using keyword dictionaries. No API calls — instant, free.
 * Falls back to null only if no location can be determined.
 */

interface LocationEntry {
  keywords: string[];
  location: string;
  lat: number;
  lng: number;
  military: boolean;
}

// Ordered by specificity — more specific entries first
const LOCATIONS: LocationEntry[] = [
  // ---- Israeli military ----
  { keywords: ["nevatim"], location: "Nevatim Air Base, Israel", lat: 31.21, lng: 34.87, military: true },
  { keywords: ["ramat david"], location: "Ramat David Air Base, Israel", lat: 32.67, lng: 35.18, military: true },
  { keywords: ["hatzerim"], location: "Hatzerim Air Base, Israel", lat: 31.23, lng: 34.66, military: true },
  { keywords: ["palmachim"], location: "Palmachim Air Base, Israel", lat: 31.89, lng: 34.68, military: true },
  { keywords: ["ramon", "ramon airbase", "ramon air base"], location: "Ramon Air Base, Israel", lat: 30.78, lng: 34.67, military: true },
  { keywords: ["dimona", "negev nuclear"], location: "Dimona Nuclear Facility, Israel", lat: 31.00, lng: 35.15, military: true },
  { keywords: ["haifa naval", "haifa port", "haifa base"], location: "Haifa Naval Base, Israel", lat: 32.82, lng: 34.98, military: true },
  { keywords: ["tel nof"], location: "Tel Nof Air Base, Israel", lat: 31.84, lng: 34.82, military: true },
  { keywords: ["sdot micha", "jericho missile"], location: "Sdot Micha Base, Israel", lat: 31.73, lng: 34.96, military: true },
  { keywords: ["iron dome"], location: "Iron Dome Battery, Israel", lat: 31.80, lng: 34.78, military: true },

  // ---- Israeli cities ----
  { keywords: ["tel aviv"], location: "Tel Aviv, Israel", lat: 32.085, lng: 34.782, military: false },
  { keywords: ["jerusalem", "al-quds"], location: "Jerusalem, Israel", lat: 31.769, lng: 35.216, military: false },
  { keywords: ["haifa"], location: "Haifa, Israel", lat: 32.794, lng: 34.990, military: false },
  { keywords: ["beer sheva", "be'er sheva", "beersheba"], location: "Beer Sheva, Israel", lat: 31.252, lng: 34.791, military: false },
  { keywords: ["ashkelon"], location: "Ashkelon, Israel", lat: 31.668, lng: 34.571, military: false },
  { keywords: ["ashdod"], location: "Ashdod, Israel", lat: 31.804, lng: 34.655, military: false },
  { keywords: ["netanya"], location: "Netanya, Israel", lat: 32.332, lng: 34.857, military: false },
  { keywords: ["eilat"], location: "Eilat, Israel", lat: 29.558, lng: 34.952, military: false },
  { keywords: ["tiberias"], location: "Tiberias, Israel", lat: 32.796, lng: 35.530, military: false },
  { keywords: ["herzliya"], location: "Herzliya, Israel", lat: 32.162, lng: 34.779, military: false },
  { keywords: ["petah tikva"], location: "Petah Tikva, Israel", lat: 32.087, lng: 34.886, military: false },
  { keywords: ["rishon lezion"], location: "Rishon LeZion, Israel", lat: 31.964, lng: 34.804, military: false },
  { keywords: ["nazareth"], location: "Nazareth, Israel", lat: 32.699, lng: 35.304, military: false },
  { keywords: ["golan"], location: "Golan Heights", lat: 33.00, lng: 35.80, military: true },
  { keywords: ["sderot"], location: "Sderot, Israel", lat: 31.525, lng: 34.596, military: false },
  { keywords: ["kiryat shmona"], location: "Kiryat Shmona, Israel", lat: 33.208, lng: 35.573, military: false },
  { keywords: ["nahariya"], location: "Nahariya, Israel", lat: 33.005, lng: 35.098, military: false },

  // ---- Gaza ----
  { keywords: ["gaza city", "gaza strip"], location: "Gaza City, Gaza", lat: 31.502, lng: 34.466, military: false },
  { keywords: ["rafah"], location: "Rafah, Gaza", lat: 31.297, lng: 34.245, military: false },
  { keywords: ["khan younis", "khan yunis"], location: "Khan Younis, Gaza", lat: 31.345, lng: 34.303, military: false },
  { keywords: ["jabalia", "jabaliya"], location: "Jabalia, Gaza", lat: 31.528, lng: 34.483, military: false },
  { keywords: ["nuseirat"], location: "Nuseirat, Gaza", lat: 31.443, lng: 34.393, military: false },
  { keywords: ["deir al-balah"], location: "Deir al-Balah, Gaza", lat: 31.418, lng: 34.351, military: false },

  // ---- Lebanon ----
  { keywords: ["beirut"], location: "Beirut, Lebanon", lat: 33.894, lng: 35.503, military: false },
  { keywords: ["dahieh", "dahiyeh", "southern suburbs"], location: "Dahieh, Beirut, Lebanon", lat: 33.847, lng: 35.520, military: false },
  { keywords: ["baalbek"], location: "Baalbek, Lebanon", lat: 34.006, lng: 36.211, military: false },
  { keywords: ["tyre", "sour"], location: "Tyre, Lebanon", lat: 33.272, lng: 35.196, military: false },
  { keywords: ["sidon", "saida"], location: "Sidon, Lebanon", lat: 33.560, lng: 35.376, military: false },
  { keywords: ["nabatieh"], location: "Nabatieh, Lebanon", lat: 33.378, lng: 35.484, military: false },
  { keywords: ["south lebanon", "southern lebanon"], location: "South Lebanon", lat: 33.30, lng: 35.40, military: true },
  { keywords: ["bekaa", "beqaa"], location: "Bekaa Valley, Lebanon", lat: 33.85, lng: 36.05, military: false },
  { keywords: ["tripoli, lebanon"], location: "Tripoli, Lebanon", lat: 34.437, lng: 35.832, military: false },

  // ---- Syria ----
  { keywords: ["damascus"], location: "Damascus, Syria", lat: 33.513, lng: 36.292, military: false },
  { keywords: ["aleppo"], location: "Aleppo, Syria", lat: 36.202, lng: 37.134, military: false },
  { keywords: ["homs"], location: "Homs, Syria", lat: 34.730, lng: 36.713, military: false },
  { keywords: ["latakia"], location: "Latakia, Syria", lat: 35.532, lng: 35.791, military: false },
  { keywords: ["deir ez-zor", "deir ezzor"], location: "Deir ez-Zor, Syria", lat: 35.336, lng: 40.146, military: false },
  { keywords: ["t4 airbase", "t-4", "tiyas"], location: "T4 Air Base, Syria", lat: 34.522, lng: 37.627, military: true },
  { keywords: ["mezzeh"], location: "Mezzeh Air Base, Syria", lat: 33.478, lng: 36.223, military: true },

  // ---- Iranian military ----
  { keywords: ["isfahan", "esfahan"], location: "Isfahan, Iran", lat: 32.65, lng: 51.68, military: false },
  { keywords: ["natanz"], location: "Natanz Nuclear Facility, Iran", lat: 33.73, lng: 51.73, military: true },
  { keywords: ["fordow"], location: "Fordow Nuclear Facility, Iran", lat: 34.88, lng: 51.59, military: true },
  { keywords: ["parchin"], location: "Parchin Military Complex, Iran", lat: 35.52, lng: 51.77, military: true },
  { keywords: ["bushehr"], location: "Bushehr, Iran", lat: 28.97, lng: 50.84, military: false },
  { keywords: ["bandar abbas"], location: "Bandar Abbas, Iran", lat: 27.18, lng: 56.27, military: true },
  { keywords: ["kharg island"], location: "Kharg Island, Iran", lat: 29.24, lng: 50.31, military: true },
  { keywords: ["tabriz"], location: "Tabriz, Iran", lat: 38.08, lng: 46.28, military: false },
  { keywords: ["shiraz"], location: "Shiraz, Iran", lat: 29.59, lng: 52.58, military: false },
  { keywords: ["tehran"], location: "Tehran, Iran", lat: 35.69, lng: 51.39, military: false },
  { keywords: ["semnan"], location: "Semnan, Iran", lat: 35.58, lng: 53.39, military: true },
  { keywords: ["kermanshah"], location: "Kermanshah, Iran", lat: 34.35, lng: 47.07, military: true },
  { keywords: ["dezful"], location: "Dezful, Iran", lat: 32.38, lng: 48.40, military: true },
  { keywords: ["chabahar"], location: "Chabahar, Iran", lat: 25.29, lng: 60.64, military: true },
  { keywords: ["kish island"], location: "Kish Island, Iran", lat: 26.56, lng: 53.98, military: false },
  { keywords: ["arak"], location: "Arak, Iran", lat: 34.09, lng: 49.70, military: true },
  { keywords: ["mashhad"], location: "Mashhad, Iran", lat: 36.30, lng: 59.61, military: false },
  { keywords: ["qom"], location: "Qom, Iran", lat: 34.64, lng: 50.88, military: false },
  { keywords: ["abadan"], location: "Abadan, Iran", lat: 30.34, lng: 48.30, military: false },
  { keywords: ["khorramabad"], location: "Khorramabad, Iran", lat: 33.49, lng: 48.35, military: true },

  // ---- UAE ----
  { keywords: ["al dhafra", "dhafra"], location: "Al Dhafra Air Base, UAE", lat: 24.25, lng: 54.55, military: true },
  { keywords: ["al minhad", "minhad"], location: "Al Minhad Air Base, UAE", lat: 25.03, lng: 55.37, military: true },
  { keywords: ["jebel ali"], location: "Jebel Ali, Dubai, UAE", lat: 25.02, lng: 55.06, military: false },
  { keywords: ["dubai airport", "dubai international"], location: "Dubai International Airport, UAE", lat: 25.25, lng: 55.36, military: false },
  { keywords: ["palm jumeirah"], location: "Palm Jumeirah, Dubai, UAE", lat: 25.11, lng: 55.14, military: false },
  { keywords: ["burj khalifa"], location: "Burj Khalifa, Dubai, UAE", lat: 25.20, lng: 55.27, military: false },
  { keywords: ["burj al arab"], location: "Burj Al Arab, Dubai, UAE", lat: 25.14, lng: 55.19, military: false },
  { keywords: ["dubai marina"], location: "Dubai Marina, UAE", lat: 25.08, lng: 55.14, military: false },
  { keywords: ["dubai"], location: "Dubai, UAE", lat: 25.276, lng: 55.296, military: false },
  { keywords: ["abu dhabi airport", "zayed airport"], location: "Zayed International Airport, Abu Dhabi", lat: 24.44, lng: 54.65, military: false },
  { keywords: ["abu dhabi"], location: "Abu Dhabi, UAE", lat: 24.453, lng: 54.377, military: false },
  { keywords: ["fujairah"], location: "Fujairah, UAE", lat: 25.13, lng: 56.34, military: false },
  { keywords: ["sharjah"], location: "Sharjah, UAE", lat: 25.35, lng: 55.42, military: false },

  // ---- Qatar ----
  { keywords: ["al udeid"], location: "Al Udeid Air Base, Qatar", lat: 25.12, lng: 51.31, military: true },
  { keywords: ["hamad airport", "hamad international"], location: "Hamad International Airport, Qatar", lat: 25.26, lng: 51.61, military: false },
  { keywords: ["doha"], location: "Doha, Qatar", lat: 25.29, lng: 51.53, military: false },
  { keywords: ["ras laffan"], location: "Ras Laffan, Qatar", lat: 25.92, lng: 51.57, military: false },

  // ---- Bahrain ----
  { keywords: ["5th fleet", "nsa bahrain", "fifth fleet"], location: "NSA Bahrain (5th Fleet HQ)", lat: 26.24, lng: 50.58, military: true },
  { keywords: ["isa air base"], location: "Isa Air Base, Bahrain", lat: 25.92, lng: 50.59, military: true },
  { keywords: ["manama"], location: "Manama, Bahrain", lat: 26.23, lng: 50.59, military: false },
  { keywords: ["bahrain airport"], location: "Bahrain International Airport", lat: 26.27, lng: 50.63, military: false },
  { keywords: ["bahrain"], location: "Bahrain", lat: 26.07, lng: 50.56, military: false },

  // ---- Kuwait ----
  { keywords: ["ali al salem"], location: "Ali Al Salem Air Base, Kuwait", lat: 29.35, lng: 47.52, military: true },
  { keywords: ["camp arifjan"], location: "Camp Arifjan, Kuwait", lat: 29.22, lng: 48.10, military: true },
  { keywords: ["camp buehring"], location: "Camp Buehring, Kuwait", lat: 29.51, lng: 47.45, military: true },
  { keywords: ["kuwait city"], location: "Kuwait City, Kuwait", lat: 29.37, lng: 47.98, military: false },
  { keywords: ["kuwait airport", "kuwait international"], location: "Kuwait International Airport", lat: 29.23, lng: 47.97, military: false },
  { keywords: ["kuwait"], location: "Kuwait", lat: 29.31, lng: 47.48, military: false },

  // ---- Saudi Arabia ----
  { keywords: ["prince sultan", "psab"], location: "Prince Sultan Air Base, Saudi Arabia", lat: 24.06, lng: 47.58, military: true },
  { keywords: ["king khalid military"], location: "King Khalid Military City, Saudi Arabia", lat: 27.90, lng: 45.54, military: true },
  { keywords: ["abqaiq"], location: "Abqaiq, Saudi Arabia", lat: 25.94, lng: 49.68, military: false },
  { keywords: ["ras tanura"], location: "Ras Tanura, Saudi Arabia", lat: 26.64, lng: 50.17, military: false },
  { keywords: ["aramco"], location: "Aramco Facility, Saudi Arabia", lat: 26.30, lng: 50.14, military: false },
  { keywords: ["dhahran"], location: "Dhahran, Saudi Arabia", lat: 26.27, lng: 50.15, military: false },
  { keywords: ["riyadh"], location: "Riyadh, Saudi Arabia", lat: 24.71, lng: 46.68, military: false },
  { keywords: ["jeddah"], location: "Jeddah, Saudi Arabia", lat: 21.49, lng: 39.18, military: false },
  { keywords: ["dammam"], location: "Dammam, Saudi Arabia", lat: 26.43, lng: 50.10, military: false },
  { keywords: ["neom"], location: "NEOM, Saudi Arabia", lat: 28.00, lng: 35.20, military: false },

  // ---- Jordan ----
  { keywords: ["muwaffaq", "salti air base"], location: "Muwaffaq Salti Air Base, Jordan", lat: 32.36, lng: 36.78, military: true },
  { keywords: ["amman"], location: "Amman, Jordan", lat: 31.96, lng: 35.95, military: false },

  // ---- Iraq ----
  { keywords: ["ain al-asad", "ain al asad", "al-asad"], location: "Ain Al-Asad Air Base, Iraq", lat: 33.80, lng: 42.44, military: true },
  { keywords: ["green zone", "baghdad embassy"], location: "Baghdad Green Zone, Iraq", lat: 33.31, lng: 44.37, military: true },
  { keywords: ["erbil"], location: "Erbil, Iraq", lat: 36.19, lng: 44.01, military: false },
  { keywords: ["harir air base"], location: "Harir Air Base, Iraq", lat: 36.54, lng: 44.38, military: true },
  { keywords: ["baghdad"], location: "Baghdad, Iraq", lat: 33.31, lng: 44.37, military: false },

  // ---- Yemen ----
  { keywords: ["sanaa", "sana'a"], location: "Sanaa, Yemen", lat: 15.37, lng: 44.19, military: false },
  { keywords: ["hodeidah", "hudaydah"], location: "Hodeidah, Yemen", lat: 14.80, lng: 42.95, military: false },
  { keywords: ["aden"], location: "Aden, Yemen", lat: 12.79, lng: 45.04, military: false },
  { keywords: ["marib"], location: "Marib, Yemen", lat: 15.46, lng: 45.33, military: false },

  // ---- Maritime ----
  { keywords: ["strait of hormuz", "hormuz"], location: "Strait of Hormuz", lat: 26.56, lng: 56.15, military: false },
  { keywords: ["bab al-mandab", "bab el-mandeb"], location: "Bab al-Mandab Strait", lat: 12.58, lng: 43.33, military: false },
  { keywords: ["red sea"], location: "Red Sea", lat: 20.00, lng: 38.50, military: false },
  { keywords: ["persian gulf", "arabian gulf"], location: "Persian Gulf", lat: 26.50, lng: 52.00, military: false },
  { keywords: ["gulf of oman"], location: "Gulf of Oman", lat: 24.50, lng: 58.50, military: false },

  // ---- Djibouti ----
  { keywords: ["camp lemonnier", "djibouti"], location: "Camp Lemonnier, Djibouti", lat: 11.55, lng: 43.15, military: true },

  // ---- Oman ----
  { keywords: ["duqm"], location: "Duqm, Oman", lat: 19.67, lng: 57.71, military: false },
  { keywords: ["muscat"], location: "Muscat, Oman", lat: 23.59, lng: 58.54, military: false },
  { keywords: ["musandam"], location: "Musandam, Oman", lat: 26.20, lng: 56.25, military: false },
];

interface WeaponEntry {
  keywords: string[];
  weapon: string;
}

const WEAPONS: WeaponEntry[] = [
  // Iranian
  { keywords: ["shahed-136", "shahed 136"], weapon: "Shahed-136 drone" },
  { keywords: ["shahed-131", "shahed 131"], weapon: "Shahed-131 drone" },
  { keywords: ["shahed-107", "shahed 107"], weapon: "Shahed-107 drone" },
  { keywords: ["shahed"], weapon: "Shahed drone" },
  { keywords: ["fateh-110", "fateh 110"], weapon: "Fateh-110 missile" },
  { keywords: ["fattah", "fatah hypersonic"], weapon: "Fattah-1 hypersonic" },
  { keywords: ["emad"], weapon: "Emad missile" },
  { keywords: ["ghadr"], weapon: "Ghadr-1 missile" },
  { keywords: ["sejjil"], weapon: "Sejjil missile" },
  { keywords: ["khorramshahr"], weapon: "Khorramshahr-4 missile" },
  { keywords: ["paveh"], weapon: "Paveh cruise missile" },
  { keywords: ["khalij fars", "khalij-fars"], weapon: "Khalij Fars anti-ship missile" },
  { keywords: ["ya ali"], weapon: "Ya Ali cruise missile" },
  // US/Israeli
  { keywords: ["jdam"], weapon: "JDAM guided bomb" },
  { keywords: ["gbu-28", "gbu 28", "bunker buster"], weapon: "GBU-28 bunker buster" },
  { keywords: ["gbu-39", "gbu 39", "sdb", "small diameter"], weapon: "GBU-39 SDB" },
  { keywords: ["tomahawk"], weapon: "Tomahawk cruise missile" },
  { keywords: ["jassm"], weapon: "JASSM-ER cruise missile" },
  { keywords: ["delilah"], weapon: "Delilah cruise missile" },
  { keywords: ["spice"], weapon: "SPICE guided bomb" },
  { keywords: ["arrow-3", "arrow 3"], weapon: "Arrow-3 interceptor" },
  { keywords: ["iron dome"], weapon: "Iron Dome interceptor" },
  { keywords: ["david's sling", "davids sling"], weapon: "David's Sling interceptor" },
  // Generic
  { keywords: ["anti-ship missile", "anti ship missile"], weapon: "Anti-ship missile" },
  { keywords: ["cruise missile"], weapon: "Cruise missile" },
  { keywords: ["ballistic missile"], weapon: "Ballistic missile" },
  { keywords: ["hypersonic"], weapon: "Hypersonic missile" },
  { keywords: ["kamikaze drone", "loitering munition"], weapon: "Loitering munition" },
  { keywords: ["drone strike", "uav strike", "drone attack"], weapon: "Drone" },
  { keywords: ["airstrike", "air strike", "airstrikes"], weapon: "Airstrike" },
  { keywords: ["missile"], weapon: "Missile" },
  { keywords: ["drone", "uav"], weapon: "Drone" },
  { keywords: ["rocket"], weapon: "Rocket" },
];

const IRAN_ATTACKER_KEYWORDS = [
  "iran", "irgc", "iranian", "islamic republic",
  "houthi", "ansar allah",
  "hezbollah", "hizballah",
  "hashd", "pmf", "popular mobilization",
  "pij", "islamic jihad",
  "hamas",
  "axis of resistance",
  "tehran launched", "iran launched", "iran struck", "iran attacked",
  "iran fires", "iran fired",
];

const US_ISRAEL_ATTACKER_KEYWORDS = [
  "idf", "israeli", "israel struck", "israel attacked", "israel hit",
  "us struck", "us attacked", "usaf", "us air force", "pentagon",
  "coalition struck", "coalition forces",
  "f-35", "f-15", "b-2", "b-52",
  "centcom", "us central command",
  "israel fires", "israel fired", "israel launches",
];

const US_ONLY_KEYWORDS = [
  "us struck", "us attacked", "usaf", "us air force", "pentagon",
  "coalition struck", "coalition forces",
  "b-2", "b-52", "centcom", "us central command",
  "american", "united states",
];

const ISRAEL_ONLY_KEYWORDS = [
  "idf", "israeli", "israel struck", "israel attacked", "israel hit",
  "israel fires", "israel fired", "israel launches",
  "iaf", "israel defense", "mossad",
];

function matchFirst<T extends { keywords: string[] }>(
  text: string,
  entries: T[]
): T | null {
  const lower = text.toLowerCase();
  for (const entry of entries) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry;
    }
  }
  return null;
}

export function enrichWithKeywords(text: string): EnrichmentResult | null {
  if (!text || text.length < 10) return null;

  const lower = text.toLowerCase();

  // Find location
  const loc = matchFirst(text, LOCATIONS);
  if (!loc) return null; // Can't place it on the map without coordinates

  // Find weapon
  const wpn = matchFirst(text, WEAPONS);

  // Determine side
  let side: "iran" | "us" | "israel" = "iran";
  const iranScore = IRAN_ATTACKER_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const usScore = US_ISRAEL_ATTACKER_KEYWORDS.filter((kw) => lower.includes(kw)).length;

  if (usScore > iranScore) {
    // Distinguish US from Israel
    const usOnly = US_ONLY_KEYWORDS.filter((kw) => lower.includes(kw)).length;
    const ilOnly = ISRAEL_ONLY_KEYWORDS.filter((kw) => lower.includes(kw)).length;
    if (usOnly > ilOnly) {
      side = "us";
    } else if (ilOnly > usOnly) {
      side = "israel";
    } else {
      // Heuristic: strikes in Iran are likely US, others likely Israel
      side = loc.location.includes("Iran") ? "us" : "israel";
    }
  } else if (iranScore === 0 && usScore === 0) {
    // Heuristic: if target is in Iran, attacker is likely US
    if (loc.location.includes("Iran")) {
      side = "us";
    }
  }

  // Determine target type from context
  let targetType = "";
  if (lower.includes("airport")) targetType = "Airport";
  else if (lower.includes("air base") || lower.includes("airbase")) targetType = "Air base";
  else if (lower.includes("naval base") || lower.includes("navy")) targetType = "Naval base";
  else if (lower.includes("port")) targetType = "Port";
  else if (lower.includes("refinery") || lower.includes("oil")) targetType = "Oil/energy infrastructure";
  else if (lower.includes("nuclear")) targetType = "Nuclear facility";
  else if (lower.includes("embassy")) targetType = "Embassy/diplomatic";
  else if (lower.includes("hospital")) targetType = "Hospital";
  else if (lower.includes("school") || lower.includes("university")) targetType = "Educational";
  else if (lower.includes("residential") || lower.includes("apartment")) targetType = "Residential area";
  else if (lower.includes("hotel")) targetType = "Hotel";
  else if (loc.military) targetType = "Military facility";
  else targetType = "Urban area";

  return {
    location: loc.location,
    lat: loc.lat,
    lng: loc.lng,
    weapon: wpn?.weapon || "",
    target_type: targetType,
    side,
    target_military: loc.military,
    intercepted_by: "",
    intercept_success: false,
    damage_assessment: "Damage assessment pending",
    damage_severity: "minor",
    casualties_military: 0,
    casualties_civilian: 0,
    casualties_description: "No casualties reported",
  };
}
