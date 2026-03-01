import { NextResponse } from "next/server";
import { fetchTzevAdomAlerts } from "@/lib/tzevaadom";

export async function GET() {
  try {
    const alerts = await fetchTzevAdomAlerts();
    return NextResponse.json(
      { alerts },
      {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=15",
        },
      }
    );
  } catch {
    return NextResponse.json({ alerts: [] });
  }
}
