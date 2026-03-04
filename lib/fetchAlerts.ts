import { MissileAlert, InterceptionOutcome } from "./types";

interface AlertsResponse {
  alerts: MissileAlert[];
  outcomes: InterceptionOutcome[];
}

export async function fetchAlerts(): Promise<AlertsResponse> {
  try {
    const res = await fetch("/api/alerts");
    const data = await res.json();
    return {
      alerts: data.alerts || [],
      outcomes: data.outcomes || [],
    };
  } catch {
    return { alerts: [], outcomes: [] };
  }
}
