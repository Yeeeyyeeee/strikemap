import { NextRequest, NextResponse } from "next/server";
import { fetchNOTAMs, filterByRegion, FIR_CONFIG, computeRegionAirspace } from "@/lib/notam";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region") || "all";
    const validRegions = ["all", "iran", "israel", "gulf"];
    const selectedRegion = validRegions.includes(region) ? region : "all";

    const { notams, regions } = await fetchNOTAMs();

    const filteredNotams = filterByRegion(notams, selectedRegion);

    // Filter regions to match selected region
    const filteredRegions =
      selectedRegion === "all"
        ? regions
        : (() => {
            const firs = FIR_CONFIG.filter((f) => f.region === selectedRegion).map((f) => f.fir);
            return regions.filter((r) => firs.includes(r.fir));
          })();

    return NextResponse.json(
      {
        notams: filteredNotams,
        regions: filteredRegions,
        timestamp: new Date().toISOString(),
        error: false,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (e) {
    console.error("NOTAM API error:", e);
    // Graceful degradation — return empty data, not a 500
    const emptyRegions = computeRegionAirspace([]);
    return NextResponse.json(
      {
        notams: [],
        regions: emptyRegions,
        timestamp: new Date().toISOString(),
        error: true,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
