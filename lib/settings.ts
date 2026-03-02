export interface UserSettings {
  dateFrom: string | null;
  markerSize: number;
  markerOpacity: number;
  showGauges: boolean;
  showFeed: boolean;
  showLegend: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  dateFrom: "2026-03-01",
  markerSize: 0.7,
  markerOpacity: 1,
  showGauges: true,
  showFeed: true,
  showLegend: true,
  soundEnabled: true,
  notificationsEnabled: true,
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
