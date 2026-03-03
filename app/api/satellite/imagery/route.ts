/**
 * GET /api/satellite/imagery?id=<incidentId>&lat=<lat>&lng=<lng>&date=<YYYY-MM-DD>
 *
 * Returns satellite before/after imagery with full enhancement pipeline:
 * 1. Check Maxar Open Data for 30-50cm high-res imagery
 * 2. Fall back to Sentinel-2 L2A via Catalog API (find clearest <15% cloud)
 * 3. Download via Process API with SCL cloud masking
 * 4. Histogram match after→before for tonal consistency
 * 5. Enhance: CLAHE + gamma + unsharp mask + brightness/saturation
 * 6. Optional super-res (?superres=1): SEN2SR or lanczos3 4x upscale
 * 7. Optional SAR change detection (?sar=1): Sentinel-1 log-ratio
 */

import { NextResponse } from "next/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  // Check credentials before doing anything
  if (
    !process.env.SENTINEL_HUB_CLIENT_ID ||
    !process.env.SENTINEL_HUB_CLIENT_SECRET
  ) {
    return NextResponse.json(
      { error: "Sentinel Hub not configured" },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const lat = parseFloat(url.searchParams.get("lat") || "");
  const lng = parseFloat(url.searchParams.get("lng") || "");
  const date = url.searchParams.get("date");
  const wantSuperRes = url.searchParams.get("superres") === "1";
  const wantSAR = url.searchParams.get("sar") === "1";

  if (!id || isNaN(lat) || isNaN(lng) || !date) {
    return NextResponse.json(
      { error: "Missing required params: id, lat, lng, date" },
      { status: 400 },
    );
  }

  try {
    // Dynamic imports to avoid module-load crashes
    const [
      { getAccessToken, getSatelliteImagery },
      { fetchL2ARGB },
      { enhanceSatelliteImage, isBlankImage },
      { histogramMatch },
      { checkMaxarCoverage, downloadMaxarImage },
      { superResolve },
    ] = await Promise.all([
      import("@/lib/sentinel"),
      import("@/lib/sentinelProcess"),
      import("@/lib/sentinelEnhance"),
      import("@/lib/imageProcessing"),
      import("@/lib/maxarOpenData"),
      import("@/lib/sentinelProcess"),
    ]);

    // ─── Step 1: Get satellite imagery metadata (catalog search) ──
    const imagery = await getSatelliteImagery(id, lat, lng, date);
    if (!imagery) {
      return NextResponse.json(
        { error: "Satellite imagery unavailable" },
        { status: 404 },
      );
    }

    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { error: "Failed to authenticate with Sentinel Hub" },
        { status: 502 },
      );
    }

    // ─── Step 2: Check Maxar Open Data (parallel, non-blocking) ──
    const incidentDate = new Date(date);
    const beforeStart = new Date(incidentDate);
    beforeStart.setDate(beforeStart.getDate() - 90);
    const maxarPromise = checkMaxarCoverage(
      lat,
      lng,
      beforeStart.toISOString().split("T")[0],
      new Date().toISOString().split("T")[0],
    ).catch(() => null);

    // ─── Step 3: Download L2A RGB images via Process API ─────────
    const [beforeRaw, afterRaw] = await Promise.all([
      fetchL2ARGB(token, lat, lng, imagery.beforeDate),
      fetchL2ARGB(token, lat, lng, imagery.afterDate),
    ]);

    // Check for blank images
    const [beforeBlank, afterBlank] = await Promise.all([
      beforeRaw ? isBlankImage(beforeRaw) : true,
      afterRaw ? isBlankImage(afterRaw) : true,
    ]);

    const beforeValid = beforeRaw && !beforeBlank ? beforeRaw : null;
    const afterValid = afterRaw && !afterBlank ? afterRaw : null;

    // ─── Step 4: Histogram match after→before ────────────────────
    let afterMatched = afterValid;
    if (beforeValid && afterValid) {
      try {
        afterMatched = await histogramMatch(afterValid, beforeValid);
      } catch {
        // If histogram matching fails, use unmatched
        afterMatched = afterValid;
      }
    }

    // ─── Step 5: Enhance both images (CLAHE + sharpen + gamma) ───
    const [beforeEnhanced, afterEnhanced] = await Promise.all([
      beforeValid ? enhanceSatelliteImage(beforeValid) : null,
      afterMatched ? enhanceSatelliteImage(afterMatched) : null,
    ]);

    // ─── Step 6: Optional super-resolution ───────────────────────
    let beforeFinal = beforeEnhanced;
    let afterFinal = afterEnhanced;
    let superResMethod: string | undefined;

    if (wantSuperRes && beforeEnhanced && afterEnhanced) {
      try {
        const [beforeSR, afterSR] = await Promise.all([
          superResolve(beforeEnhanced),
          superResolve(afterEnhanced),
        ]);
        beforeFinal = beforeSR.buffer;
        afterFinal = afterSR.buffer;
        superResMethod = beforeSR.method;
      } catch {
        // Super-res failed, use enhanced images as-is
      }
    }

    // ─── Step 7: Optional SAR change detection ───────────────────
    let sarChangeMap: string | undefined;
    let sarChangePercent: number | undefined;

    if (wantSAR) {
      try {
        const { detectSARChange } = await import("@/lib/sentinelSAR");
        const sarResult = await detectSARChange(
          token,
          lat,
          lng,
          imagery.beforeDate,
          imagery.afterDate,
        );
        if (sarResult) {
          sarChangeMap = `data:image/png;base64,${sarResult.changeMap.toString("base64")}`;
          sarChangePercent = sarResult.changePercent;
        }
      } catch {
        // SAR failed, continue without it
      }
    }

    // ─── Step 8: Convert to JPEG for response ────────────────────
    const [beforeJpeg, afterJpeg] = await Promise.all([
      beforeFinal
        ? sharp(beforeFinal).jpeg({ quality: 92 }).toBuffer()
        : null,
      afterFinal
        ? sharp(afterFinal).jpeg({ quality: 92 }).toBuffer()
        : null,
    ]);

    // ─── Step 9: Maxar result ────────────────────────────────────
    const maxar = await maxarPromise;

    return NextResponse.json(
      {
        incidentId: imagery.incidentId,
        beforeDate: imagery.beforeDate,
        afterDate: imagery.afterDate,
        beforeImage: beforeJpeg
          ? `data:image/jpeg;base64,${beforeJpeg.toString("base64")}`
          : null,
        afterImage: afterJpeg
          ? `data:image/jpeg;base64,${afterJpeg.toString("base64")}`
          : null,
        // New metadata fields (backwards-compatible)
        beforeCloudCover: imagery.beforeCloudCover,
        afterCloudCover: imagery.afterCloudCover,
        sarChangeMap,
        sarChangePercent,
        maxarAvailable: !!maxar,
        maxarGsd: maxar?.gsd,
        superResMethod,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      },
    );
  } catch (err) {
    console.error("[api/satellite/imagery] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch satellite imagery" },
      { status: 500 },
    );
  }
}
