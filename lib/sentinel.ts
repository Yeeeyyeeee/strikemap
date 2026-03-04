/**
 * Sentinel Hub (Copernicus) client for satellite imagery.
 * Provides before/after imagery for strike verification.
 *
 * Uses the Process API + Catalog API (replaces WMS) for:
 * - L2A band selection (B02, B03, B04 at 10m) with SCL cloud masking
 * - Catalog search for clearest images (<15% cloud cover)
 * - Full enhancement pipeline (CLAHE, histogram matching, sharpen, gamma)
 *
 * Env: SENTINEL_HUB_CLIENT_ID, SENTINEL_HUB_CLIENT_SECRET
 */

import sharp from "sharp";
import { getRedis } from "./redis";
import { SatelliteImagery } from "./types";
import {
  REDIS_SENTINEL_KEY,
  REDIS_SENTINEL_TOKEN_KEY,
  SENTINEL_IMAGERY_TTL_S,
  SENTINEL_TOKEN_TTL_S,
} from "./constants";
import { findClearestImage } from "./sentinelCatalog";
import { fetchL2ARGB } from "./sentinelProcess";
import { enhanceSatelliteImage, isBlankImage } from "./sentinelEnhance";
import { histogramMatch } from "./imageProcessing";

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

// Image dimensions
const IMG_WIDTH = 1024;
const IMG_HEIGHT = 1024;

// ─── OAuth2 Token ───────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn("[sentinel] Missing SENTINEL_HUB_CLIENT_ID or SENTINEL_HUB_CLIENT_SECRET");
    return null;
  }

  // Check Redis cache
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(REDIS_SENTINEL_TOKEN_KEY);
      if (cached && typeof cached === "string") return cached;
    } catch {}
  }

  // Fetch new token
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error(`[sentinel] Token fetch failed (${res.status}): ${errBody}`);
    console.error(`[sentinel] Token URL: ${TOKEN_URL}`);
    console.error(`[sentinel] Client ID starts with: ${clientId.substring(0, 8)}...`);
    return null;
  }

  const data = await res.json();
  const token = data.access_token as string;

  // Cache token
  if (redis && token) {
    try {
      await redis.set(REDIS_SENTINEL_TOKEN_KEY, token, { ex: SENTINEL_TOKEN_TTL_S });
    } catch {}
  }

  return token;
}

// ─── Satellite Imagery Metadata ─────────────────────────────────

/**
 * Search for the clearest before/after Sentinel-2 L2A images for an incident.
 * Uses the Catalog API to find candidates with <15% cloud cover,
 * sorted by cloud cover ascending.
 */
export async function getSatelliteImagery(
  incidentId: string,
  lat: number,
  lng: number,
  date: string
): Promise<SatelliteImagery | null> {
  const token = await getAccessToken();
  if (!token) return null;

  // Check cache
  const redis = getRedis();
  const cacheKey = `${REDIS_SENTINEL_KEY}:${incidentId}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return typeof cached === "string" ? JSON.parse(cached) : (cached as SatelliteImagery);
      }
    } catch {}
  }

  // Build before/after date ranges
  const incidentDate = new Date(date);
  if (isNaN(incidentDate.getTime())) return null;

  const today = new Date().toISOString().split("T")[0];

  // Before: 90 days to 1 day before incident
  const beforeStart = new Date(incidentDate);
  beforeStart.setDate(beforeStart.getDate() - 90);
  const beforeEnd = new Date(incidentDate);
  beforeEnd.setDate(beforeEnd.getDate() - 1);
  const beforeStartStr = beforeStart.toISOString().split("T")[0];
  const beforeEndStr = beforeEnd.toISOString().split("T")[0];

  // After: day of incident to today (must be AFTER the strike)
  const afterStartStr = date; // incident date itself

  // Search catalog for clearest images in both windows (non-blocking, for metadata)
  const [beforeResult, afterResult] = await Promise.all([
    findClearestImage(token, lat, lng, beforeStartStr, beforeEndStr).catch(() => null),
    findClearestImage(token, lat, lng, afterStartStr, today).catch(() => null),
  ]);

  const imagery: SatelliteImagery = {
    incidentId,
    lat,
    lng,
    beforeDateFrom: beforeStartStr,
    beforeDateTo: beforeEndStr,
    afterDateFrom: afterStartStr,
    afterDateTo: today,
    beforeDate: beforeResult?.datetime?.split("T")[0] || beforeEndStr,
    afterDate: afterResult?.datetime?.split("T")[0] || today,
    beforeCloudCover: beforeResult?.cloudCover,
    afterCloudCover: afterResult?.cloudCover,
    catalogBeforeId: beforeResult?.id,
    catalogAfterId: afterResult?.id,
    fetchedAt: new Date().toISOString(),
  };

  // Cache — shorter TTL if catalog found no results (so we retry sooner)
  const hasBothCatalog = beforeResult && afterResult;
  const cacheTTL = hasBothCatalog ? SENTINEL_IMAGERY_TTL_S : Math.min(SENTINEL_IMAGERY_TTL_S, 300);
  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(imagery), { ex: cacheTTL });
    } catch {}
  }

  return imagery;
}

// ─── Download Satellite Image ───────────────────────────────────

/**
 * Download and enhance a Sentinel-2 L2A image for a specific date and location.
 * Uses Process API with evalscript for band selection + SCL cloud masking,
 * then applies the full enhancement pipeline (CLAHE, sharpen, gamma).
 */
export async function downloadSatelliteImage(
  lat: number,
  lng: number,
  dateFrom: string,
  dateTo: string
): Promise<Buffer | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const rawBuf = await fetchL2ARGB(token, lat, lng, dateFrom, dateTo);
    if (!rawBuf) return null;

    // Reject blank/black tiles
    if (await isBlankImage(rawBuf)) {
      console.warn(`[sentinel] Rejected blank image for ${lat},${lng} on ${dateFrom}/${dateTo}`);
      return null;
    }

    // Apply full enhancement pipeline
    return enhanceSatelliteImage(rawBuf);
  } catch (err) {
    console.error("[sentinel] Download error:", err);
    return null;
  }
}

// ─── Before/After Composite Image ───────────────────────────────

/**
 * Generate a side-by-side before/after composite image.
 * Downloads both images, applies histogram matching to normalize brightness,
 * enhances both, and composites with labels.
 */
export async function generateBeforeAfterComposite(
  lat: number,
  lng: number,
  beforeDateFrom: string,
  beforeDateTo: string,
  afterDateFrom: string,
  afterDateTo: string
): Promise<Buffer | null> {
  const token = await getAccessToken();
  if (!token) return null;

  // Download both raw images in parallel (wide date ranges, leastCC mosaicking)
  const [beforeRaw, afterRaw] = await Promise.all([
    fetchL2ARGB(token, lat, lng, beforeDateFrom, beforeDateTo),
    fetchL2ARGB(token, lat, lng, afterDateFrom, afterDateTo),
  ]);

  if (!beforeRaw || !afterRaw) return null;

  // Reject blank images
  const [beforeBlank, afterBlank] = await Promise.all([
    isBlankImage(beforeRaw),
    isBlankImage(afterRaw),
  ]);
  if (beforeBlank || afterBlank) return null;

  try {
    // Histogram match: normalize after to match before's tonal range
    const afterMatched = await histogramMatch(afterRaw, beforeRaw);

    // Enhance both
    const [beforeEnhanced, afterEnhanced] = await Promise.all([
      enhanceSatelliteImage(beforeRaw),
      enhanceSatelliteImage(afterMatched),
    ]);

    // Resize both to consistent dimensions
    const before = await sharp(beforeEnhanced)
      .resize(IMG_WIDTH, IMG_HEIGHT, { fit: "cover" })
      .jpeg()
      .toBuffer();

    const after = await sharp(afterEnhanced)
      .resize(IMG_WIDTH, IMG_HEIGHT, { fit: "cover" })
      .jpeg()
      .toBuffer();

    // Create label bars
    const labelHeight = 32;
    const totalWidth = IMG_WIDTH * 2 + 4; // 4px divider
    const totalHeight = IMG_HEIGHT + labelHeight;

    const beforeLabel = Buffer.from(
      `<svg width="${IMG_WIDTH}" height="${labelHeight}">
        <rect width="100%" height="100%" fill="#1a1a1a"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
              fill="#999" font-family="monospace" font-size="14" font-weight="bold">
          BEFORE
        </text>
      </svg>`
    );

    const afterLabel = Buffer.from(
      `<svg width="${IMG_WIDTH}" height="${labelHeight}">
        <rect width="100%" height="100%" fill="#1a1a1a"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
              fill="#ef4444" font-family="monospace" font-size="14" font-weight="bold">
          AFTER
        </text>
      </svg>`
    );

    const divider = Buffer.from(
      `<svg width="4" height="${totalHeight}">
        <rect width="4" height="${totalHeight}" fill="#333"/>
      </svg>`
    );

    const composite = await sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 3,
        background: { r: 26, g: 26, b: 26 },
      },
    })
      .composite([
        { input: await sharp(beforeLabel).png().toBuffer(), top: 0, left: 0 },
        { input: await sharp(afterLabel).png().toBuffer(), top: 0, left: IMG_WIDTH + 4 },
        { input: before, top: labelHeight, left: 0 },
        { input: await sharp(divider).png().toBuffer(), top: 0, left: IMG_WIDTH },
        { input: after, top: labelHeight, left: IMG_WIDTH + 4 },
      ])
      .jpeg({ quality: 85 })
      .toBuffer();

    return composite;
  } catch (err) {
    console.error("[sentinel] Composite generation error:", err);
    return null;
  }
}
