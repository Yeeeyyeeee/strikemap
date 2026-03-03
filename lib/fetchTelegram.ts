import { Incident } from "./types";

export async function fetchTelegramData(): Promise<Incident[]> {
  try {
    const res = await fetch("/api/telegram/messages");
    const data = await res.json();
    return data.incidents || [];
  } catch {
    console.error("Failed to fetch Telegram data");
    return [];
  }
}
