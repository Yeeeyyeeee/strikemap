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
    !process.env.SENTINEL_HUB_CLIENT_SECRET ||
    !process.env.SENTINEL_HUB_INSTANCE_ID
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
  const debug = url.searchParams.get("debug") === "1";

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

    // ─── Step 0: Authenticate first ────────────────────────────────
    console.log("[satellite/imagery] Step 0: Getting access token...");
    const token = await getAccessToken();
    if (!token) {
      console.error("[satellite/imagery] OAuth token failed - check SENTINEL_HUB_CLIENT_ID and SENTINEL_HUB_CLIENT_SECRET are from dataspace.copernicus.eu (not sentinelhub.com)");
      return NextResponse.json(
        { error: "Failed to authenticate with Sentinel Hub. Ensure credentials are from Copernicus Data Space (dataspace.copernicus.eu)." },
        { status: 502 },
      );
    }
    console.log("[satellite/imagery] Step 0: Token obtained successfully");

    // ─── Step 1: Get satellite imagery metadata (catalog search) ──
    console.log(`[satellite/imagery] Step 1: Catalog search for ${lat},${lng} on ${date}...`);
    const imagery = await getSatelliteImagery(id, lat, lng, date);
    if (!imagery) {
      console.error("[satellite/imagery] Catalog search returned no results");
      return NextResponse.json(
        { error: "Satellite imagery unavailable - no clear images found in catalog" },
        { status: 404 },
      );
    }
    console.log(`[satellite/imagery] Step 1: Found imagery - before: ${imagery.beforeDateFrom}→${imagery.beforeDateTo}, after: ${imagery.afterDateFrom}→${imagery.afterDateTo}`);

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
    // Use full date ranges with mosaickingOrder: "leastCC" so the
    // Process API picks the clearest image automatically
    console.log(`[satellite/imagery] Step 3: Downloading L2A RGB...`);
    const [beforeRaw, afterRaw] = await Promise.all([
      fetchL2ARGB(token, lat, lng, imagery.beforeDateFrom, imagery.beforeDateTo),
      fetchL2ARGB(token, lat, lng, imagery.afterDateFrom, imagery.afterDateTo),
    ]);
    console.log(`[satellite/imagery] Step 3: before=${beforeRaw ? beforeRaw.length + 'B' : 'null'}, after=${afterRaw ? afterRaw.length + 'B' : 'null'}`);

    // Check for blank images
    const [beforeBlank, afterBlank] = await Promise.all([
      beforeRaw ? isBlankImage(beforeRaw) : true,
      afterRaw ? isBlankImage(afterRaw) : true,
    ]);
    if (beforeBlank && beforeRaw) console.warn(`[satellite/imagery] Before image rejected as blank (mean brightness < threshold) for ${lat},${lng}`);
    if (afterBlank && afterRaw) console.warn(`[satellite/imagery] After image rejected as blank for ${lat},${lng}`);
    if (!beforeRaw) console.warn(`[satellite/imagery] Before image fetch returned null for ${lat},${lng} (${imagery.beforeDateFrom}→${imagery.beforeDateTo})`);
    if (!afterRaw) console.warn(`[satellite/imagery] After image fetch returned null for ${lat},${lng} (${imagery.afterDateFrom}→${imagery.afterDateTo})`);

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

    // If missing an image, use short CDN cache so it re-fetches sooner
    // (satellite may revisit within hours)
    const hasBothImages = beforeJpeg && afterJpeg;
    const cacheControl = hasBothImages
      ? "public, s-maxage=3600, stale-while-revalidate=7200"
      : "public, s-maxage=300, stale-while-revalidate=600";

    return NextResponse.json(
      {
        incidentId: imagery.incidentId,
        beforeDate: imagery.beforeDate,
        afterDate: imagery.afterDate,
        afterDateTo: imagery.afterDateTo,
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
        headers: { "Cache-Control": cacheControl },
      },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error("[api/satellite/imagery] Error:", errorMsg, errorStack);
    return NextResponse.json(
      {
        error: "Failed to fetch satellite imagery",
        ...(debug ? { detail: errorMsg, stack: errorStack } : {}),
      },
      { status: 500 },
    );
  }
}
