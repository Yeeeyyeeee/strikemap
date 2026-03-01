export interface ProxyGroup {
  name: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  color: string;
  description: string;
}

export interface ProxyConnection {
  from: [number, number]; // [lng, lat]
  to: [number, number]; // [lng, lat]
  label: string;
}

export const TEHRAN: [number, number] = [51.39, 35.69]; // [lng, lat]

export const PROXY_GROUPS: ProxyGroup[] = [
  {
    name: "Hezbollah",
    centerLat: 33.85,
    centerLng: 35.86,
    radiusKm: 80,
    color: "#22c55e",
    description: "Lebanese Shia militant group. Primary Iranian proxy in the Levant.",
  },
  {
    name: "Houthis (Ansar Allah)",
    centerLat: 15.35,
    centerLng: 44.21,
    radiusKm: 200,
    color: "#eab308",
    description: "Yemeni rebel movement. Controls Sana'a and northern Yemen.",
  },
  {
    name: "PMF (Hashd al-Shaabi)",
    centerLat: 33.30,
    centerLng: 44.37,
    radiusKm: 150,
    color: "#f97316",
    description: "Iraqi Shia paramilitary coalition. State-sanctioned, Iran-backed.",
  },
  {
    name: "Palestinian Islamic Jihad",
    centerLat: 31.50,
    centerLng: 34.47,
    radiusKm: 30,
    color: "#14b8a6",
    description: "Palestinian militant group in Gaza. Directly funded by IRGC.",
  },
  {
    name: "Hamas",
    centerLat: 31.42,
    centerLng: 34.35,
    radiusKm: 35,
    color: "#10b981",
    description: "Palestinian Sunni Islamist movement governing Gaza.",
  },
];

export const PROXY_CONNECTIONS: ProxyConnection[] = PROXY_GROUPS.map((g) => ({
  from: TEHRAN,
  to: [g.centerLng, g.centerLat],
  label: g.name,
}));

/** Create GeoJSON circle for proxy territory */
export function createProxyCircle(
  lat: number,
  lng: number,
  radiusKm: number,
  points = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const earthR = 6371;

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dLat = (radiusKm / earthR) * (180 / Math.PI);
    const dLng = dLat / Math.cos((lat * Math.PI) / 180);
    coords.push([lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}
