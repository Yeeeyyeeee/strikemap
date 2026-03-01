import { NextResponse } from "next/server";
import { fetchTelegramIncidents } from "@/lib/telegram";

export async function GET() {
  try {
    const incidents = await fetchTelegramIncidents();
    return NextResponse.json(
      { incidents },
      {
        headers: {
          "Cache-Control": "public, s-maxage=20, stale-while-revalidate=30",
        },
      }
    );
  } catch {
    return NextResponse.json({ incidents: [], error: "Failed to fetch" });
  }
}
