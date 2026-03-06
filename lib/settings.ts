export interface UserSettings {
  dateFrom: string | null;
  markerSize: number;
  markerOpacity: number;
  showGauges: boolean;
  showFeed: boolean;
  showLegend: boolean;
  soundEnabled: boolean;
  soundAlerts: boolean;   // missile alert beeps
  soundSiren: boolean;    // air-raid siren loop
  soundImpacts: boolean;  // strike impact thud
  soundBrrt: boolean;     // A10 strafing
  notificationsEnabled: boolean;
  autoZoomStrikes: boolean;
  autoZoomAlerts: boolean;
  volume: number; // 0-100
  activeWidgets?: string[];
  widgetPositions?: Record<string, { x: number; y: number; w?: number; h?: number }>;
  alertCountries?: string[] | "all";
}

export const DEFAULT_SETTINGS: UserSettings = {
  dateFrom: "2026-02-28",
  markerSize: 0.7,
  markerOpacity: 1,
  showGauges: true,
  showFeed: true,
  showLegend: true,
  soundEnabled: true,
  soundAlerts: true,
  soundSiren: true,
  soundImpacts: true,
  soundBrrt: true,
  notificationsEnabled: true,
  autoZoomStrikes: true,
  autoZoomAlerts: true,
  volume: 80,
};

const STORAGE_KEY = "strikemap-settings";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UserSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
