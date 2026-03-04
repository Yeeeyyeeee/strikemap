export interface MilitaryBase {
  name: string;
  lat: number;
  lng: number;
  operator: "iran" | "iran_proxy" | "us_coalition" | "israel" | "russia" | "regional";
  type: "air" | "naval" | "army" | "missile" | "nuclear";
}

export const OPERATOR_LABELS: Record<MilitaryBase["operator"], string> = {
  iran: "Iranian",
  iran_proxy: "Iran-Aligned",
  us_coalition: "US/Coalition",
  israel: "Israeli",
  russia: "Russian",
  regional: "Regional",
};

export const MILITARY_BASES: MilitaryBase[] = [
  // ──────────────────────────────────────
  // IRAN
  // ──────────────────────────────────────
  { name: "Isfahan AFB (8th TAB)", lat: 32.75, lng: 51.86, operator: "iran", type: "air" },
  { name: "Tabriz AFB (2nd TAB)", lat: 38.13, lng: 46.24, operator: "iran", type: "air" },
  { name: "Bushehr AFB (6th TAB)", lat: 28.95, lng: 50.83, operator: "iran", type: "air" },
  { name: "Dezful AFB (4th TAB)", lat: 32.43, lng: 48.39, operator: "iran", type: "air" },
  { name: "Mehrabad AFB, Tehran", lat: 35.69, lng: 51.31, operator: "iran", type: "air" },
  { name: "Shiraz AFB (7th TAB)", lat: 29.54, lng: 52.59, operator: "iran", type: "air" },
  { name: "Hamadan AB (3rd TAB)", lat: 34.87, lng: 48.55, operator: "iran", type: "air" },
  { name: "Chabahar Naval Base", lat: 25.44, lng: 60.62, operator: "iran", type: "naval" },
  { name: "Bandar Abbas Naval Base", lat: 27.15, lng: 56.23, operator: "iran", type: "naval" },
  { name: "Jask Naval/Missile Base", lat: 25.64, lng: 57.77, operator: "iran", type: "naval" },
  { name: "Semnan Missile Test Site", lat: 35.23, lng: 53.92, operator: "iran", type: "missile" },
  { name: "Parchin Military Complex", lat: 35.52, lng: 51.77, operator: "iran", type: "missile" },
  { name: "Kermanshah Missile Base", lat: 34.35, lng: 47.07, operator: "iran", type: "missile" },
  { name: "Khorramabad Missile Base", lat: 33.44, lng: 48.28, operator: "iran", type: "missile" },
  { name: "Natanz Nuclear Facility", lat: 33.73, lng: 51.73, operator: "iran", type: "nuclear" },
  { name: "Fordow Nuclear Facility", lat: 34.88, lng: 51.59, operator: "iran", type: "nuclear" },
  { name: "Arak IR-40 Reactor", lat: 34.38, lng: 49.24, operator: "iran", type: "nuclear" },
  {
    name: "Bushehr Nuclear Power Plant",
    lat: 28.83,
    lng: 50.89,
    operator: "iran",
    type: "nuclear",
  },
  { name: "IRGC Khatam HQ, Tehran", lat: 35.7, lng: 51.4, operator: "iran", type: "army" },

  // ──────────────────────────────────────
  // IRAN-ALIGNED PROXIES
  // ──────────────────────────────────────
  // Hezbollah — Lebanon
  {
    name: "Hezbollah Southern Command, Nabatieh",
    lat: 33.38,
    lng: 35.48,
    operator: "iran_proxy",
    type: "army",
  },
  {
    name: "Hezbollah Bekaa Valley HQ",
    lat: 33.85,
    lng: 36.1,
    operator: "iran_proxy",
    type: "army",
  },
  // Houthis — Yemen
  {
    name: "Houthi Missile Command, Sanaa",
    lat: 15.36,
    lng: 44.21,
    operator: "iran_proxy",
    type: "missile",
  },
  {
    name: "Hudaydah Port (Houthi Naval)",
    lat: 14.8,
    lng: 42.95,
    operator: "iran_proxy",
    type: "naval",
  },
  { name: "Houthi Drone Base, Dhamar", lat: 14.55, lng: 44.4, operator: "iran_proxy", type: "air" },
  // Iraqi PMF / IRGC-aligned
  {
    name: "PMF HQ, Baghdad (Hashd al-Shaabi)",
    lat: 33.31,
    lng: 44.37,
    operator: "iran_proxy",
    type: "army",
  },
  {
    name: "Jurf al-Sakhar Base, Iraq (PMF)",
    lat: 32.92,
    lng: 44.12,
    operator: "iran_proxy",
    type: "army",
  },
  // IRGC in Syria
  {
    name: "T-4 (Tiyas) AB, Syria (IRGC)",
    lat: 34.52,
    lng: 37.63,
    operator: "iran_proxy",
    type: "air",
  },
  {
    name: "Imam Ali Base, Abu Kamal, Syria (IRGC)",
    lat: 34.45,
    lng: 40.92,
    operator: "iran_proxy",
    type: "army",
  },

  // ──────────────────────────────────────
  // US / COALITION (inc. UK, NATO)
  // ──────────────────────────────────────
  // Qatar
  { name: "Al Udeid AB, Qatar", lat: 25.12, lng: 51.31, operator: "us_coalition", type: "air" },
  // UAE
  { name: "Al Dhafra AB, UAE", lat: 24.25, lng: 54.55, operator: "us_coalition", type: "air" },
  // Kuwait
  {
    name: "Ali Al Salem AB, Kuwait",
    lat: 29.35,
    lng: 47.52,
    operator: "us_coalition",
    type: "air",
  },
  { name: "Camp Arifjan, Kuwait", lat: 29.22, lng: 48.1, operator: "us_coalition", type: "army" },
  // Bahrain
  {
    name: "NSA Bahrain (5th Fleet)",
    lat: 26.24,
    lng: 50.58,
    operator: "us_coalition",
    type: "naval",
  },
  // Djibouti
  {
    name: "Camp Lemonnier, Djibouti",
    lat: 11.55,
    lng: 43.15,
    operator: "us_coalition",
    type: "army",
  },
  // Cyprus (UK Sovereign Bases)
  {
    name: "RAF Akrotiri, Cyprus (UK)",
    lat: 34.59,
    lng: 32.99,
    operator: "us_coalition",
    type: "air",
  },
  {
    name: "RAF Dhekelia, Cyprus (UK)",
    lat: 34.98,
    lng: 33.72,
    operator: "us_coalition",
    type: "army",
  },
  // Turkey
  {
    name: "Incirlik AB, Turkey (US/NATO)",
    lat: 37.0,
    lng: 35.43,
    operator: "us_coalition",
    type: "air",
  },
  {
    name: "Kürecik Radar Station, Turkey (NATO)",
    lat: 38.71,
    lng: 37.93,
    operator: "us_coalition",
    type: "missile",
  },
  // Jordan
  {
    name: "Muwaffaq Salti AB, Jordan (US)",
    lat: 31.83,
    lng: 36.78,
    operator: "us_coalition",
    type: "air",
  },
  { name: "Azraq AB, Jordan (US)", lat: 31.83, lng: 36.24, operator: "us_coalition", type: "air" },
  // Iraq
  { name: "Al Asad AB, Iraq (US)", lat: 33.79, lng: 42.44, operator: "us_coalition", type: "air" },
  { name: "Erbil AB, Iraq (US)", lat: 36.24, lng: 43.96, operator: "us_coalition", type: "air" },
  // Saudi Arabia
  {
    name: "Prince Sultan AB, Saudi Arabia (US)",
    lat: 24.06,
    lng: 47.58,
    operator: "us_coalition",
    type: "air",
  },
  // Oman
  {
    name: "Thumrait AB, Oman (US access)",
    lat: 17.67,
    lng: 54.03,
    operator: "us_coalition",
    type: "air",
  },
  {
    name: "Masirah Island AB, Oman (US access)",
    lat: 20.68,
    lng: 58.89,
    operator: "us_coalition",
    type: "air",
  },
  // Diego Garcia
  { name: "Diego Garcia (US/UK)", lat: -7.32, lng: 72.42, operator: "us_coalition", type: "air" },

  // ──────────────────────────────────────
  // ISRAEL
  // ──────────────────────────────────────
  { name: "Nevatim AB", lat: 31.21, lng: 34.87, operator: "israel", type: "air" },
  { name: "Ramat David AB", lat: 32.67, lng: 35.18, operator: "israel", type: "air" },
  { name: "Hatzerim AB", lat: 31.23, lng: 34.66, operator: "israel", type: "air" },
  { name: "Ramon AB", lat: 30.78, lng: 34.67, operator: "israel", type: "air" },
  { name: "Tel Nof AB", lat: 31.84, lng: 34.82, operator: "israel", type: "air" },
  { name: "Palmachim AB", lat: 31.89, lng: 34.68, operator: "israel", type: "missile" },
  { name: "Haifa Naval Base", lat: 32.82, lng: 34.98, operator: "israel", type: "naval" },
  { name: "Ashdod Naval Base", lat: 31.8, lng: 34.63, operator: "israel", type: "naval" },
  { name: "Dimona (Negev Nuclear)", lat: 31.0, lng: 35.15, operator: "israel", type: "nuclear" },
  {
    name: "Iron Dome Battery, Hadera",
    lat: 32.44,
    lng: 34.92,
    operator: "israel",
    type: "missile",
  },
  { name: "Arrow Battery, Palmachim", lat: 31.88, lng: 34.7, operator: "israel", type: "missile" },

  // ──────────────────────────────────────
  // RUSSIA (Syria)
  // ──────────────────────────────────────
  { name: "Khmeimim AB, Latakia, Syria", lat: 35.41, lng: 35.95, operator: "russia", type: "air" },
  { name: "Tartus Naval Base, Syria", lat: 34.89, lng: 35.87, operator: "russia", type: "naval" },

  // ──────────────────────────────────────
  // REGIONAL (local military)
  // ──────────────────────────────────────
  // Saudi Arabia
  { name: "King Abdulaziz AB, Dhahran", lat: 26.27, lng: 50.15, operator: "regional", type: "air" },
  {
    name: "King Khalid AB, Khamis Mushait",
    lat: 18.3,
    lng: 42.8,
    operator: "regional",
    type: "air",
  },
  { name: "King Fahd AB, Taif", lat: 21.48, lng: 40.54, operator: "regional", type: "air" },
  { name: "King Faisal AB, Tabuk", lat: 28.37, lng: 36.63, operator: "regional", type: "air" },
  {
    name: "King Faisal Naval Base, Jeddah",
    lat: 21.37,
    lng: 39.17,
    operator: "regional",
    type: "naval",
  },
  {
    name: "King Abdulaziz Naval Base, Jubail",
    lat: 27.04,
    lng: 49.62,
    operator: "regional",
    type: "naval",
  },
  // Jordan
  {
    name: "King Abdullah II AB, Mafraq",
    lat: 32.36,
    lng: 36.26,
    operator: "regional",
    type: "air",
  },
  {
    name: "King Hussein AB, H-5, Jordan",
    lat: 32.16,
    lng: 37.15,
    operator: "regional",
    type: "air",
  },
  // Turkey
  { name: "Konya AB, Turkey", lat: 37.98, lng: 32.56, operator: "regional", type: "air" },
  { name: "Diyarbakir AB, Turkey", lat: 37.89, lng: 40.2, operator: "regional", type: "air" },
  { name: "Ankara-Akinci AB, Turkey", lat: 40.08, lng: 32.57, operator: "regional", type: "air" },
  { name: "Aksaz Naval Base, Turkey", lat: 36.97, lng: 28.4, operator: "regional", type: "naval" },
  // Cyprus
  {
    name: "Andreas Papandreou AFB, Paphos",
    lat: 34.72,
    lng: 32.48,
    operator: "regional",
    type: "air",
  },
  {
    name: "Larnaca Airport (Military), Cyprus",
    lat: 34.88,
    lng: 33.63,
    operator: "regional",
    type: "air",
  },
  // Oman
  { name: "RAFO Musanah, Oman", lat: 23.64, lng: 57.49, operator: "regional", type: "air" },
  { name: "RAFO Adam, Oman", lat: 22.49, lng: 57.63, operator: "regional", type: "air" },
  {
    name: "Said bin Sultan Naval Base, Oman",
    lat: 23.63,
    lng: 58.57,
    operator: "regional",
    type: "naval",
  },
  // Iraq
  { name: "Balad AB, Iraq", lat: 33.94, lng: 44.36, operator: "regional", type: "air" },
  {
    name: "Basra Airport (Military), Iraq",
    lat: 30.55,
    lng: 47.66,
    operator: "regional",
    type: "air",
  },
  // Syria
  {
    name: "Mezzeh Military Airport, Damascus",
    lat: 33.48,
    lng: 36.22,
    operator: "regional",
    type: "air",
  },
  { name: "Dumayr AB, Syria", lat: 33.61, lng: 36.75, operator: "regional", type: "air" },
  // Lebanon
  { name: "Rayak AB, Lebanon", lat: 33.85, lng: 35.99, operator: "regional", type: "air" },
  {
    name: "Beirut Naval Base, Lebanon",
    lat: 33.9,
    lng: 35.48,
    operator: "regional",
    type: "naval",
  },
  // Yemen (government)
  { name: "Al Anad AB, Yemen", lat: 13.18, lng: 44.77, operator: "regional", type: "air" },
  // Egypt
  { name: "Cairo West AB, Egypt", lat: 30.12, lng: 30.92, operator: "regional", type: "air" },
  {
    name: "Berenice Military Base, Egypt",
    lat: 23.98,
    lng: 35.47,
    operator: "regional",
    type: "air",
  },
  // Bahrain
  { name: "Isa AB, Bahrain", lat: 26.16, lng: 50.55, operator: "regional", type: "air" },
  // UAE
  { name: "Al Minhad AB, UAE", lat: 25.02, lng: 55.37, operator: "regional", type: "air" },
  { name: "Zayed Military City, UAE", lat: 24.1, lng: 54.53, operator: "regional", type: "army" },
];

export const BASE_COLORS: Record<MilitaryBase["operator"], string> = {
  iran: "#ef4444",
  iran_proxy: "#f97316",
  us_coalition: "#3b82f6",
  israel: "#60a5fa",
  russia: "#f59e0b",
  regional: "#22c55e",
};

export function getBaseIcon(type: MilitaryBase["type"]): string {
  switch (type) {
    case "air":
      return `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 20,18 12,14 4,18"/></svg>`;
    case "naval":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3"/><line x1="12" y1="11" x2="12" y2="20"/><path d="M6,17 Q12,23 18,17"/><line x1="8" y1="13" x2="16" y2="13"/></svg>`;
    case "army":
      return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,2 L22,8 L22,16 L12,22 L2,16 L2,8 Z"/></svg>`;
    case "missile":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="16"/><polygon points="8,16 12,22 16,16" fill="currentColor"/><line x1="8" y1="8" x2="12" y2="12"/><line x1="16" y1="8" x2="12" y2="12"/></svg>`;
    case "nuclear":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="9"/><line x1="12" y1="3" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="21"/><line x1="3" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="21" y2="12"/></svg>`;
  }
}
