import { MissileAlert } from "./types";

export async function fetchAlerts(): Promise<MissileAlert[]> {
  try {
    const res = await fetch("/api/alerts");
    const data = await res.json();
    return data.alerts || [];
  } catch {
    return [];
  }
}
