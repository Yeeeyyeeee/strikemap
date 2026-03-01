export interface MilitaryBase {
  name: string;
  lat: number;
  lng: number;
  operator: "iran" | "us_coalition" | "israel";
  type: "air" | "naval" | "army" | "missile" | "nuclear";
}

export const MILITARY_BASES: MilitaryBase[] = [
  // ---- Iranian ----
  { name: "Isfahan AFB (8th TAB)", lat: 32.75, lng: 51.86, operator: "iran", type: "air" },
  { name: "Tabriz AFB (2nd TAB)", lat: 38.13, lng: 46.24, operator: "iran", type: "air" },
  { name: "Bushehr AFB (6th TAB)", lat: 28.95, lng: 50.83, operator: "iran", type: "air" },
  { name: "Dezful AFB (4th TAB)", lat: 32.43, lng: 48.39, operator: "iran", type: "air" },
  { name: "Bandar Abbas Naval Base", lat: 27.15, lng: 56.23, operator: "iran", type: "naval" },
  { name: "Jask Naval/Missile Base", lat: 25.64, lng: 57.77, operator: "iran", type: "naval" },
  { name: "Semnan Missile Test Site", lat: 35.23, lng: 53.92, operator: "iran", type: "missile" },
  { name: "Parchin Military Complex", lat: 35.52, lng: 51.77, operator: "iran", type: "missile" },
  { name: "Natanz Nuclear Facility", lat: 33.73, lng: 51.73, operator: "iran", type: "nuclear" },
  { name: "Fordow Nuclear Facility", lat: 34.88, lng: 51.59, operator: "iran", type: "nuclear" },
  { name: "IRGC Khatam HQ, Tehran", lat: 35.70, lng: 51.40, operator: "iran", type: "army" },
  { name: "Kermanshah Missile Base", lat: 34.35, lng: 47.07, operator: "iran", type: "missile" },

  // ---- US / Coalition ----
  { name: "Al Udeid AB, Qatar", lat: 25.12, lng: 51.31, operator: "us_coalition", type: "air" },
  { name: "Al Dhafra AB, UAE", lat: 24.25, lng: 54.55, operator: "us_coalition", type: "air" },
  { name: "Ali Al Salem AB, Kuwait", lat: 29.35, lng: 47.52, operator: "us_coalition", type: "air" },
  { name: "Camp Arifjan, Kuwait", lat: 29.22, lng: 48.10, operator: "us_coalition", type: "army" },
  { name: "NSA Bahrain (5th Fleet)", lat: 26.24, lng: 50.58, operator: "us_coalition", type: "naval" },
  { name: "Camp Lemonnier, Djibouti", lat: 11.55, lng: 43.15, operator: "us_coalition", type: "army" },

  // ---- Israeli ----
  { name: "Nevatim AB", lat: 31.21, lng: 34.87, operator: "israel", type: "air" },
  { name: "Ramat David AB", lat: 32.67, lng: 35.18, operator: "israel", type: "air" },
  { name: "Hatzerim AB", lat: 31.23, lng: 34.66, operator: "israel", type: "air" },
  { name: "Palmachim AB", lat: 31.89, lng: 34.68, operator: "israel", type: "missile" },
  { name: "Haifa Naval Base", lat: 32.82, lng: 34.98, operator: "israel", type: "naval" },
  { name: "Dimona (Negev Nuclear)", lat: 31.00, lng: 35.15, operator: "israel", type: "nuclear" },
];

export const BASE_COLORS: Record<MilitaryBase["operator"], string> = {
  iran: "#ef4444",
  us_coalition: "#3b82f6",
  israel: "#60a5fa",
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
