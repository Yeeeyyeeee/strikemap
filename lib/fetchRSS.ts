import { Incident } from "./types";

export async function fetchRSSData(): Promise<Incident[]> {
  try {
    const res = await fetch("/api/rss");
    const data = await res.json();
    return data.incidents || [];
  } catch {
    console.error("Failed to fetch RSS data");
    return [];
  }
}
