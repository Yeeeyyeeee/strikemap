export interface WeaponSpec {
  name: string;
  side: "iran" | "us_israel";
  type: "ballistic" | "cruise" | "drone" | "guided_bomb" | "anti_ship" | "hypersonic";
  range_km: number;
  speed: string;
  warhead_kg: number;
  cep_m: number;
  description: string;
  launchSites: { name: string; lat: number; lng: number }[];
}

export const WEAPONS_CATALOG: WeaponSpec[] = [
  // ---- Iranian ----
  {
    name: "Fateh-110",
    side: "iran",
    type: "ballistic",
    range_km: 300,
    speed: "Mach 3",
    warhead_kg: 450,
    cep_m: 100,
    description: "Short-range solid-fuel ballistic missile. Road-mobile, rapid deployment. GPS/INS guided.",
    launchSites: [
      { name: "Tabriz TAB", lat: 38.08, lng: 46.28 },
      { name: "Kermanshah", lat: 34.35, lng: 47.07 },
    ],
  },
  {
    name: "Emad",
    side: "iran",
    type: "ballistic",
    range_km: 1700,
    speed: "Mach 10+",
    warhead_kg: 750,
    cep_m: 500,
    description: "Medium-range liquid-fuel ballistic missile with maneuverable reentry vehicle (MaRV).",
    launchSites: [
      { name: "Khorramabad", lat: 33.49, lng: 48.35 },
      { name: "Isfahan", lat: 32.65, lng: 51.68 },
    ],
  },
  {
    name: "Ghadr-1",
    side: "iran",
    type: "ballistic",
    range_km: 1950,
    speed: "Mach 10+",
    warhead_kg: 750,
    cep_m: 300,
    description: "Extended-range variant of Shahab-3. Liquid-fueled MRBM with improved guidance.",
    launchSites: [
      { name: "Tabriz TAB", lat: 38.08, lng: 46.28 },
      { name: "Khorramabad", lat: 33.49, lng: 48.35 },
    ],
  },
  {
    name: "Sejjil",
    side: "iran",
    type: "ballistic",
    range_km: 2500,
    speed: "Mach 12+",
    warhead_kg: 750,
    cep_m: 300,
    description: "Two-stage solid-fuel MRBM. Faster launch preparation than liquid-fuel alternatives.",
    launchSites: [
      { name: "Semnan", lat: 35.58, lng: 53.39 },
      { name: "Isfahan", lat: 32.65, lng: 51.68 },
    ],
  },
  {
    name: "Khorramshahr-4",
    side: "iran",
    type: "ballistic",
    range_km: 2000,
    speed: "Mach 12",
    warhead_kg: 1500,
    cep_m: 200,
    description: "Heavy-payload MRBM with MIRV capability. Liquid-fueled, multiple warhead variant.",
    launchSites: [
      { name: "Semnan", lat: 35.58, lng: 53.39 },
    ],
  },
  {
    name: "Fattah-1",
    side: "iran",
    type: "hypersonic",
    range_km: 1400,
    speed: "Mach 13-15",
    warhead_kg: 450,
    cep_m: 30,
    description: "Iran's first hypersonic missile with HGV. Designed to penetrate missile defense systems.",
    launchSites: [
      { name: "Isfahan", lat: 32.65, lng: 51.68 },
    ],
  },
  {
    name: "Shahed-136",
    side: "iran",
    type: "drone",
    range_km: 2500,
    speed: "185 km/h",
    warhead_kg: 40,
    cep_m: 5,
    description: "Loitering munition / kamikaze drone. Delta-wing, GPS-guided. Mass-produced for saturation attacks.",
    launchSites: [
      { name: "Isfahan UAV Base", lat: 32.65, lng: 51.68 },
      { name: "Kermanshah", lat: 34.35, lng: 47.07 },
    ],
  },
  {
    name: "Shahed-131",
    side: "iran",
    type: "drone",
    range_km: 900,
    speed: "185 km/h",
    warhead_kg: 15,
    cep_m: 5,
    description: "Smaller variant of Shahed-136. Lighter warhead, shorter range, same guidance system.",
    launchSites: [
      { name: "Isfahan UAV Base", lat: 32.65, lng: 51.68 },
    ],
  },
  {
    name: "Shahed-107",
    side: "iran",
    type: "drone",
    range_km: 450,
    speed: "200 km/h",
    warhead_kg: 20,
    cep_m: 10,
    description: "Short-range reconnaissance/attack drone. Used by Hezbollah and Houthis.",
    launchSites: [
      { name: "Isfahan UAV Base", lat: 32.65, lng: 51.68 },
    ],
  },
  {
    name: "Paveh",
    side: "iran",
    type: "cruise",
    range_km: 1650,
    speed: "Mach 0.7",
    warhead_kg: 450,
    cep_m: 10,
    description: "Long-range ground-launched cruise missile. Terrain-hugging flight profile.",
    launchSites: [
      { name: "Kermanshah", lat: 34.35, lng: 47.07 },
      { name: "Dezful", lat: 32.38, lng: 48.40 },
    ],
  },
  {
    name: "Khalij Fars",
    side: "iran",
    type: "anti_ship",
    range_km: 300,
    speed: "Mach 3",
    warhead_kg: 450,
    cep_m: 8,
    description: "Anti-ship ballistic missile based on Fateh-110. Electro-optical terminal seeker.",
    launchSites: [
      { name: "Bandar Abbas", lat: 27.18, lng: 56.27 },
      { name: "Jask", lat: 25.64, lng: 57.77 },
    ],
  },
  {
    name: "Ya Ali",
    side: "iran",
    type: "cruise",
    range_km: 700,
    speed: "Mach 0.75",
    warhead_kg: 250,
    cep_m: 5,
    description: "Air-launched or ground-launched cruise missile. Turbojet-powered, INS/GPS guided.",
    launchSites: [
      { name: "Isfahan", lat: 32.65, lng: 51.68 },
    ],
  },

  // ---- US / Israeli ----
  {
    name: "JDAM (GBU-31)",
    side: "us_israel",
    type: "guided_bomb",
    range_km: 28,
    speed: "Subsonic (glide)",
    warhead_kg: 430,
    cep_m: 5,
    description: "GPS/INS guided bomb kit on Mk 84 2000-lb body. Workhorse precision munition.",
    launchSites: [
      { name: "Al Udeid AB, Qatar", lat: 25.12, lng: 51.31 },
      { name: "Nevatim AB, Israel", lat: 31.21, lng: 34.87 },
    ],
  },
  {
    name: "GBU-28",
    side: "us_israel",
    type: "guided_bomb",
    range_km: 15,
    speed: "Subsonic (glide)",
    warhead_kg: 2130,
    cep_m: 5,
    description: "Deep-penetrating 'bunker buster'. Laser-guided, designed for hardened underground targets.",
    launchSites: [
      { name: "Al Udeid AB, Qatar", lat: 25.12, lng: 51.31 },
    ],
  },
  {
    name: "GBU-39 SDB",
    side: "us_israel",
    type: "guided_bomb",
    range_km: 110,
    speed: "Subsonic (glide)",
    warhead_kg: 17,
    cep_m: 1,
    description: "Small Diameter Bomb. GPS-guided, diamond-back wings for extended glide range. Low collateral.",
    launchSites: [
      { name: "Al Dhafra AB, UAE", lat: 24.25, lng: 54.55 },
      { name: "Ramat David AB, Israel", lat: 32.67, lng: 35.18 },
    ],
  },
  {
    name: "Tomahawk (BGM-109)",
    side: "us_israel",
    type: "cruise",
    range_km: 2500,
    speed: "Mach 0.75",
    warhead_kg: 450,
    cep_m: 5,
    description: "Sea/sub-launched cruise missile. TERCOM + GPS + DSMAC guidance. Stand-off strike capability.",
    launchSites: [
      { name: "USS carrier group (Gulf)", lat: 26.5, lng: 52.0 },
    ],
  },
  {
    name: "JASSM-ER (AGM-158B)",
    side: "us_israel",
    type: "cruise",
    range_km: 925,
    speed: "Mach 0.8",
    warhead_kg: 450,
    cep_m: 3,
    description: "Air-launched stealth cruise missile. Low-observable airframe, infrared seeker terminal guidance.",
    launchSites: [
      { name: "Al Udeid AB, Qatar", lat: 25.12, lng: 51.31 },
      { name: "Diego Garcia", lat: -7.31, lng: 72.41 },
    ],
  },
  {
    name: "Delilah",
    side: "us_israel",
    type: "cruise",
    range_km: 250,
    speed: "Mach 0.7",
    warhead_kg: 30,
    cep_m: 1,
    description: "Israeli air-launched cruise missile. Loitering capability, TV/IR seeker, man-in-the-loop.",
    launchSites: [
      { name: "Ramat David AB, Israel", lat: 32.67, lng: 35.18 },
      { name: "Hatzerim AB, Israel", lat: 31.23, lng: 34.66 },
    ],
  },
  {
    name: "SPICE 250",
    side: "us_israel",
    type: "guided_bomb",
    range_km: 100,
    speed: "Subsonic (glide)",
    warhead_kg: 113,
    cep_m: 3,
    description: "Stand-off precision guidance kit. Scene-matching AI seeker for GPS-denied environments.",
    launchSites: [
      { name: "Nevatim AB, Israel", lat: 31.21, lng: 34.87 },
    ],
  },
  {
    name: "Arrow-3",
    side: "us_israel",
    type: "ballistic",
    range_km: 2400,
    speed: "Mach 9",
    warhead_kg: 0,
    cep_m: 0,
    description: "Exo-atmospheric interceptor. Kill vehicle uses kinetic hit-to-kill. Designed vs. Iranian MRBMs.",
    launchSites: [
      { name: "Palmachim AB, Israel", lat: 31.89, lng: 34.68 },
    ],
  },
];

/** Create a GeoJSON circle polygon for range visualization */
export function createCircleGeoJSON(
  lat: number,
  lng: number,
  radiusKm: number,
  points = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const earthRadiusKm = 6371;

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dLat = (radiusKm / earthRadiusKm) * (180 / Math.PI);
    const dLng = dLat / Math.cos((lat * Math.PI) / 180);

    coords.push([
      lng + dLng * Math.cos(angle),
      lat + dLat * Math.sin(angle),
    ]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
  };
}
