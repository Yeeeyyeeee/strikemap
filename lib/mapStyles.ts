export interface MapStyle {
  id: string;
  name: string;
  url: string;
}

export const MAP_STYLES: MapStyle[] = [
  { id: "dark", name: "Dark", url: "mapbox://styles/mapbox/dark-v11" },
  { id: "satellite", name: "Satellite", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  { id: "light", name: "Light", url: "mapbox://styles/mapbox/light-v11" },
  { id: "terrain", name: "Terrain", url: "mapbox://styles/mapbox/outdoors-v12" },
];

export function getStoredStyle(): string {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem("strikemap-map-style") || "dark";
}

export function setStoredStyle(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("strikemap-map-style", id);
}
