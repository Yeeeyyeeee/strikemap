/**
 * Sentinel Hub Catalog API client.
 * Searches Sentinel-2 L2A products to find the clearest images
 * (lowest cloud cover) for a given location and date range.
 */

import { SENTINEL_MAX_CLOUD_COVER, SENTINEL_CATALOG_LIMIT } from "./constants";

const CATALOG_URL =
  "https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search";

// Bounding box half-size in degrees (~900m at equator)
const BBOX_SIZE_DEG = 0.008;

export interface CatalogResult {
  id: string;
  datetime: string; // ISO datetime of acquisition
  cloudCover: number; // 0-100
}

// ─── Catalog Search ─────────────────────────────────────────────

/**
 * Search the Sentinel-2 L2A catalog for images within a bounding box and
 * date range. Returns results sorted by cloud cover ascending (clearest first).
 */
export async function searchCatalog(
  token: string,
  bbox: [number, number, number, number],
  dateFrom: string,
  dateTo: string,
  maxCloudCover = SENTINEL_MAX_CLOUD_COVER,
  limit = SENTINEL_CATALOG_LIMIT,
): Promise<CatalogResult[]> {
  const body = {
    bbox,
    datetime: `${dateFrom}T00:00:00Z/${dateTo}T23:59:59Z`,
    collections: ["sentinel-2-l2a"],
    limit,
    filter: `eo:cloud_cover < ${maxCloudCover}`,
    "filter-lang": "cql2-text",
  };

  const res = await fetch(CATALOG_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    console.error(
      `[sentinelCatalog] Search failed (${res.status}):`,
      await res.text().catch(() => ""),
    );
    return [];
  }

  const data = await res.json();
  const features: unknown[] = data.features || [];

  const results: CatalogResult[] = features
    .map((f: any) => ({
      id: f.id as string,
      datetime: (f.properties?.datetime as string) || "",
      cloudCover: (f.properties?.["eo:cloud_cover"] as number) ?? 100,
    }))
    .filter((r) => r.datetime);

  // Sort by cloud cover ascending (clearest first)
  results.sort((a, b) => a.cloudCover - b.cloudCover);

  return results;
}

// ─── Find Clearest Image ────────────────────────────────────────

/**
 * Find the single clearest Sentinel-2 L2A image for a given location
 * and date range. Builds a bounding box from BBOX_SIZE_DEG, searches
 * the catalog, and returns the best candidate.
 */
export async function findClearestImage(
  token: string,
  lat: number,
  lng: number,
  dateFrom: string,
  dateTo: string,
): Promise<CatalogResult | null> {
  const bbox: [number, number, number, number] = [
    lng - BBOX_SIZE_DEG,
    lat - BBOX_SIZE_DEG,
    lng + BBOX_SIZE_DEG,
    lat + BBOX_SIZE_DEG,
  ];

  const results = await searchCatalog(token, bbox, dateFrom, dateTo);
  return results.length > 0 ? results[0] : null;
}
