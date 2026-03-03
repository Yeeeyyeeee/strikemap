/**
 * Maxar Open Data Program client.
 * Checks for free 30-50cm high-resolution imagery on AWS S3
 * before falling back to Sentinel-2 (10m resolution).
 *
 * Maxar Open Data: https://www.maxar.com/open-data
 * S3 bucket: s3://maxar-open-data/
 * STAC catalog hosted at the same bucket root.
 */

import sharp from "sharp";
import { getRedis } from "./redis";
import { MAXAR_CACHE_TTL_S } from "./constants";

const MAXAR_STAC_ROOT = "https://maxar-opendata.s3.amazonaws.com";
const MAXAR_EVENTS_URL = `${MAXAR_STAC_ROOT}/events/catalog.json`;

export interface MaxarScene {
  id: string;
  datetime: string;
  bbox: [number, number, number, number];
  gsd: number; // ground sample distance in meters (0.3-0.5)
  imageUrl: string; // COG tile URL
  eventName: string;
}

// ─── STAC Catalog Search ────────────────────────────────────────

/**
 * Check if Maxar Open Data has high-resolution imagery covering a location.
 * Searches the STAC catalog on S3 for events with imagery intersecting
 * the given coordinates and date range.
 *
 * Returns the best (highest resolution) scene, or null if nothing found.
 */
export async function checkMaxarCoverage(
  lat: number,
  lng: number,
  dateFrom: string,
  dateTo: string,
): Promise<MaxarScene | null> {
  // Check Redis cache first
  const redis = getRedis();
  const cacheKey = `maxar_coverage:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached === "none") return null;
      if (cached && typeof cached === "string") return JSON.parse(cached);
      if (cached && typeof cached === "object") return cached as unknown as MaxarScene;
    } catch {}
  }

  try {
    // Fetch the top-level STAC catalog to get event collections
    const catalogRes = await fetch(MAXAR_EVENTS_URL, {
      signal: AbortSignal.timeout(10000),
    });

    if (!catalogRes.ok) {
      console.warn(`[maxar] Catalog fetch failed (${catalogRes.status})`);
      return cacheAndReturn(redis, cacheKey, null);
    }

    const catalog = await catalogRes.json();
    const links: { href: string; title?: string }[] = catalog.links || [];

    // Filter for "child" links (event collections)
    const childLinks = links.filter(
      (l: any) => l.rel === "child" && l.href,
    );

    // Search each event collection for matching imagery
    // Limit to most recent 20 events to avoid excessive requests
    const recentLinks = childLinks.slice(-20);

    const results: MaxarScene[] = [];

    // Check events in parallel (batch of 5 at a time)
    for (let i = 0; i < recentLinks.length; i += 5) {
      const batch = recentLinks.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map((link) =>
          searchEventCollection(link.href, link.title || "", lat, lng, dateFrom, dateTo)
            .catch(() => null),
        ),
      );
      for (const r of batchResults) {
        if (r) results.push(r);
      }
    }

    if (results.length === 0) {
      return cacheAndReturn(redis, cacheKey, null);
    }

    // Pick the highest resolution (lowest GSD) scene
    results.sort((a, b) => a.gsd - b.gsd);
    const best = results[0];

    return cacheAndReturn(redis, cacheKey, best);
  } catch (err) {
    console.error("[maxar] Coverage check error:", err);
    return null;
  }
}

// ─── Event Collection Search ────────────────────────────────────

async function searchEventCollection(
  collectionUrl: string,
  eventName: string,
  lat: number,
  lng: number,
  dateFrom: string,
  dateTo: string,
): Promise<MaxarScene | null> {
  // Resolve relative URLs against STAC root
  const fullUrl = collectionUrl.startsWith("http")
    ? collectionUrl
    : `${MAXAR_STAC_ROOT}/${collectionUrl}`;

  const res = await fetch(fullUrl, {
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return null;
  const collection = await res.json();

  // Check if collection bbox intersects our point
  const bbox = collection.extent?.spatial?.bbox?.[0] as number[] | undefined;
  if (!bbox || bbox.length < 4) return null;
  if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
    return null; // no spatial overlap
  }

  // Check temporal overlap
  const temporal = collection.extent?.temporal?.interval?.[0] as string[] | undefined;
  if (temporal && temporal.length >= 2) {
    const colStart = temporal[0] ? new Date(temporal[0]) : new Date(0);
    const colEnd = temporal[1] ? new Date(temporal[1]) : new Date();
    const reqStart = new Date(dateFrom);
    const reqEnd = new Date(dateTo);
    if (reqEnd < colStart || reqStart > colEnd) {
      return null; // no temporal overlap
    }
  }

  // Find item links in the collection
  const itemLinks = (collection.links || []).filter(
    (l: any) => l.rel === "item" && l.href,
  );

  // Check first few items for actual coverage
  for (const itemLink of itemLinks.slice(0, 5)) {
    const itemUrl = itemLink.href.startsWith("http")
      ? itemLink.href
      : `${fullUrl.replace(/\/[^/]*$/, "/")}${itemLink.href}`;

    try {
      const itemRes = await fetch(itemUrl, {
        signal: AbortSignal.timeout(5000),
      });
      if (!itemRes.ok) continue;

      const item = await itemRes.json();
      const itemBbox = item.bbox as number[] | undefined;
      if (!itemBbox || itemBbox.length < 4) continue;
      if (lng < itemBbox[0] || lng > itemBbox[2] || lat < itemBbox[1] || lat > itemBbox[3]) {
        continue;
      }

      // Extract image asset URL
      const assets = item.assets || {};
      const visualAsset =
        assets.visual || assets.image || assets.data || Object.values(assets)[0];
      if (!visualAsset || !visualAsset.href) continue;

      const gsd = item.properties?.gsd ||
        item.properties?.["eo:gsd"] ||
        0.5; // default 50cm

      return {
        id: item.id || "unknown",
        datetime: item.properties?.datetime || "",
        bbox: itemBbox as [number, number, number, number],
        gsd: typeof gsd === "number" ? gsd : parseFloat(gsd) || 0.5,
        imageUrl: visualAsset.href,
        eventName,
      };
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Download Maxar Image ───────────────────────────────────────

/**
 * Download a Maxar Open Data image tile.
 * These are Cloud-Optimized GeoTIFFs (COG); we fetch the full file
 * and convert to PNG with Sharp.
 */
export async function downloadMaxarImage(
  scene: MaxarScene,
): Promise<Buffer | null> {
  try {
    const res = await fetch(scene.imageUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`[maxar] Image download failed (${res.status})`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    // Convert to PNG (Sharp handles TIFF/COG input)
    return sharp(buf).png().toBuffer();
  } catch (err) {
    console.error("[maxar] Image download error:", err);
    return null;
  }
}

// ─── Cache Helper ───────────────────────────────────────────────

async function cacheAndReturn(
  redis: ReturnType<typeof getRedis>,
  key: string,
  result: MaxarScene | null,
): Promise<MaxarScene | null> {
  if (redis) {
    try {
      await redis.set(
        key,
        result ? JSON.stringify(result) : "none",
        { ex: MAXAR_CACHE_TTL_S },
      );
    } catch {}
  }
  return result;
}
