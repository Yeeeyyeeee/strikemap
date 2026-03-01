import Papa from "papaparse";
import { Incident } from "./types";

export async function fetchSheetData(): Promise<Incident[]> {
  const url = process.env.NEXT_PUBLIC_SHEET_URL;
  if (!url) return [];

  const res = await fetch(url);
  const csv = await res.text();

  return new Promise((resolve) => {
    Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const incidents: Incident[] = rows
          .filter((row) => row.lat && row.lng)
          .map((row, i) => ({
            id: `sheet-${i}`,
            date: row.date || "",
            location: row.location || "",
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng),
            description: row.description || "",
            details: row.details || "",
            weapon: row.weapon || "",
            target_type: row.target_type || "",
            video_url: row.video_url || "",
            source_url: row.source_url || "",
            source: "sheet" as const,
            side: (row.side === "us" ? "us" as const : row.side === "israel" ? "israel" as const : row.side === "us_israel" ? "us_israel" as const : "iran" as const),
            target_military: row.target_military === "true",
          }));
        resolve(incidents);
      },
    });
  });
}
