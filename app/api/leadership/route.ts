import { NextResponse } from "next/server";
import { getLeadership } from "@/lib/leadership";

export async function GET() {
  try {
    const leaders = await getLeadership();
    return NextResponse.json(
      { leaders },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    console.error("Leadership API error:", err);
    // Fall back to base data on error
    const { BASE_LEADERS } = await import("@/lib/leadership");
    return NextResponse.json({ leaders: BASE_LEADERS });
  }
}
