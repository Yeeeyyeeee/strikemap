import { NextRequest, NextResponse } from "next/server";
import { fetchNOTAMs, filterByRegion, FIR_CONFIG, computeRegionAirspace } from "@/lib/notam";
import { getRedis } from "@/lib/redis";
import { REDIS_AIRSPACE_OVERRIDES_KEY } from "@/lib/constants";
import { RegionAirspace, AirspaceStatus } from "@/lib/types";

/** Read admin overrides from Redis and apply to regions */
async function applyOverrides(regions: RegionAirspace[]): Promise<RegionAirspace[]> {
  try {
    const r = getRedis();
    if (!r) return regions;
    const raw = await r.get(REDIS_AIRSPACE_OVERRIDES_KEY);
    if (!raw) return regions;
    const overrides: Record<string, { status: AirspaceStatus; setAt: string }> =
      typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!overrides || Object.keys(overrides).length === 0) return regions;

    return regions.map((region) => {
      const override = overrides[region.fir];
      if (!override) return region;
      return {
        ...region,
        status: override.status,
        manual_override: true,
        override_set_at: override.setAt,
      };
    });
  } catch {
    return regions;
  }
}

export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region") || "all";
    const validRegions = ["all", "iran", "israel", "gulf"];
    const selectedRegion = validRegions.includes(region) ? region : "all";

    const { notams, regions } = await fetchNOTAMs();

    const filteredNotams = filterByRegion(notams, selectedRegion);

    // Filter regions to match selected region
    let filteredRegions =
      selectedRegion === "all"
        ? regions
        : (() => {
            const firs = FIR_CONFIG.filter((f) => f.region === selectedRegion).map((f) => f.fir);
            return regions.filter((r) => firs.includes(r.fir));
          })();

    // Apply admin overrides
    filteredRegions = await applyOverrides(filteredRegions);

    return NextResponse.json(
      {
        notams: filteredNotams,
        regions: filteredRegions,
        timestamp: new Date().toISOString(),
        error: false,
      },
      {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
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
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
      }
    );
  }
}
